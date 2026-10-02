import { CONFIG } from '../config';
import type { ThemeId } from '../world';
import { Music } from './music';
import { driveCurve, impulseResponse, midiHz, noiseBuffer, pluckEnv, ROOT_MIDI } from './synth';

// Sound design overview
//
//   sources ─┬─ music bus ─────┐
//            ├─ sfx bus ───────┼─ master ─ muffle (low-pass) ─ limiter ─ out
//            ├─ ambience bus ──┘     ▲
//            ├─ reverb send ─ convolver ─┤   (more inside the ship)
//            └─ echo send ─── delay loop ┘   (long, tempo-synced in the canyon)
//
// Continuous layers (engine body, rumble, turbine whine, air, boost roar,
// canyon wind, interior hum) are built once and steered with parameter
// targets. One-shots create a few short-lived nodes and let them finish.
//
// Browsers only start audio from a user gesture, and on phones a finger-down
// doesn't count, so unlock listens for pointerup/touchend/click/keydown.

const A = CONFIG.audio;

/** Per-frame inputs, reused (no allocation). */
export interface AudioState {
  playing: boolean;
  speed: number;
  boost: number; // 0..1
  steer: number; // -1..1
  canyon: number; // 0..1
  interior: number; // 0..1
  daylight: number; // 0..1
  intensity: number; // 0..1, from level and speed
  chain: number; // near-miss chain length (builds the music up)
}

export class Sound {
  private ctx: AudioContext | null = null;
  private muted = false;
  private musicLevel = 1; // player settings, 0..1
  private effectsLevel = 1;
  private paused = false;
  private engineOn = false; // false after a crash until the next run
  private frame = 0;
  private clankTimer = 0;

  private master!: GainNode;
  private muffle!: BiquadFilterNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverbSend!: GainNode;
  private reverbReturn!: GainNode;
  private echoSend!: GainNode;
  private echoDelay!: DelayNode;
  private echoFeedback!: GainNode;
  private echoReturn!: GainNode;
  private white!: AudioBuffer;
  private pink!: AudioBuffer;
  private brown!: AudioBuffer;

  private bodyOscs: OscillatorNode[] = [];
  private bodyFilter!: BiquadFilterNode;
  private bodyGain!: GainNode;
  private rumbleFilter!: BiquadFilterNode;
  private rumbleGain!: GainNode;
  private whine!: OscillatorNode;
  private whineGain!: GainNode;
  private airFilter!: BiquadFilterNode;
  private airPan!: StereoPannerNode;
  private airGain!: GainNode;
  private roarFilter!: BiquadFilterNode;
  private roarGain!: GainNode;
  private windGain!: GainNode;
  private humGain!: GainNode;
  private music!: Music;

  // --- lifecycle -------------------------------------------------------------

  attachUnlock(): void {
    const unlock = () => this.unlock();
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, unlock, { passive: true });
    }
  }

  unlock(): void {
    if (!this.ctx) this.build();
    const ctx = this.ctx;
    if (!ctx || this.paused) return;
    if (ctx.state !== 'running') void ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : A.master, this.ctx.currentTime, 0.05);
  }

  /** Player volume settings (0..1 each). Effects also scale the engine and ambience. */
  setLevels(music: number, effects: number): void {
    this.musicLevel = music;
    this.effectsLevel = effects;
    const ctx = this.ctx;
    if (!ctx) return; // applied when the graph is built
    const t = ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(A.musicBus * music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(A.sfxBus * effects, t, 0.05);
    this.ambBus.gain.setTargetAtTime(A.ambienceBus * effects, t, 0.05);
  }

  /** Back to the title screen: lift any crash muffle, idle engine. */
  toTitle(): void {
    this.resume();
    this.engineOn = true;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(20000, t, 0.15);
  }

  suspend(): void {
    this.paused = true;
    void this.ctx?.suspend();
  }

  resume(): void {
    this.paused = false;
    void this.ctx?.resume();
  }

  setTheme(theme: ThemeId): void {
    this.music?.setTheme(theme);
  }

  // --- per frame -------------------------------------------------------------

  update(dt: number, s: AudioState): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const m = this.music;
    m.speedNorm = clamp01((s.speed - CONFIG.speed.base) / (CONFIG.speed.max - CONFIG.speed.base));
    m.boost = s.boost;
    m.daylight = s.daylight;
    m.intensity = s.intensity;
    m.chain = s.chain;
    m.melody = s.playing && this.engineOn;
    m.schedule();
    this.echoDelay.delayTime.setTargetAtTime(
      lerp(m.beatSeconds() * 0.75, 0.42, s.canyon), // dotted eighth, or a long canyon echo
      ctx.currentTime,
      0.3,
    );

    // Interior: occasional distant metal creaks.
    if (s.interior > 0.5) {
      this.clankTimer -= dt;
      if (this.clankTimer <= 0) {
        this.clankTimer = Math.max(1, -Math.log(Math.random()) / A.clanksPerSecond); // random, ~5 s apart
        this.clank();
      }
    }

    // Parameter targets only every few frames.
    if (this.frame++ % 3 !== 0) return;
    const t = ctx.currentTime;
    const n = m.speedNorm;
    const b = s.boost;
    const on = this.engineOn ? 1 : 0;
    const run = s.playing ? 1 : 0;

    // Engine body: root and fifth in D, rising up to ~8 semitones with speed and boost.
    const rise = Math.pow(2, (n * 5 + b * 3) / 12);
    const root = midiHz(ROOT_MIDI - 12) * rise;
    this.bodyOscs[0].frequency.setTargetAtTime(root, t, 0.2);
    this.bodyOscs[1].frequency.setTargetAtTime(root * 1.5, t, 0.2);
    this.bodyFilter.frequency.setTargetAtTime(240 + n * 500 + b * 900, t, 0.15);
    this.bodyGain.gain.setTargetAtTime(on * (run ? A.engine * (1 + b * 0.3) : A.engineIdle), t, 0.2);

    this.rumbleFilter.frequency.setTargetAtTime(110 + n * 220 + b * 320, t, 0.15);
    this.rumbleGain.gain.setTargetAtTime(on * run * A.rumble * (0.6 + 0.4 * n + 0.6 * b), t, 0.15);

    this.whine.frequency.setTargetAtTime(midiHz(ROOT_MIDI + 36) * Math.pow(2, (n * 7 + b * 5) / 12), t, 0.25);
    this.whineGain.gain.setTargetAtTime(on * run * A.whine * (0.4 + 0.6 * n + 1.2 * b), t, 0.2);

    this.airFilter.frequency.setTargetAtTime(500 + n * 700 + b * 1600, t, 0.12);
    this.airPan.pan.setTargetAtTime(-s.steer * 0.35, t, 0.1);
    this.airGain.gain.setTargetAtTime(on * run * (A.air * (0.5 + 0.8 * n) + A.airBoost * b), t, 0.1);

    this.roarFilter.frequency.setTargetAtTime(800 + b * 700, t, 0.1);
    this.roarGain.gain.setTargetAtTime(on * run * A.roar * b, t, 0.08);

    this.windGain.gain.setTargetAtTime(A.canyonWind * s.canyon, t, 0.5);
    this.humGain.gain.setTargetAtTime(A.interiorHum * s.interior, t, 0.5);

    // Space: dry on open ground, roomy inside, echoing in the canyon.
    this.reverbReturn.gain.setTargetAtTime(lerp(A.reverbLand, A.reverbInterior, s.interior), t, 0.6);
    this.echoReturn.gain.setTargetAtTime(lerp(A.echoLand, A.echoCanyon, s.canyon), t, 0.6);
    this.echoFeedback.gain.setTargetAtTime(0.3 + 0.25 * s.canyon, t, 0.6);
  }

  // --- events ----------------------------------------------------------------

  /** Run starts: lift the muffle and spool the engine up. */
  ignite(): void {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    this.engineOn = true;
    this.music.start();
    const t = ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(20000, t, 0.15);
    // Spool: a rising whine and a swell of air.
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(midiHz(ROOT_MIDI + 36), t + 0.9);
    const g = ctx.createGain();
    pluckEnv(g.gain, t, A.boost * 0.35, 0.3, 0.9);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 1.6);
    this.sweep(t, 200, 1800, 0.8, A.boost * 0.5, 0);
  }

  /**
   * An obstacle passed: `side` -1 left / 1 right, `gap` to its edge.
   * `chain` > 0 makes it a near miss: louder whoosh plus a note that
   * climbs the current scale with each link.
   */
  pass(side: number, gap: number, chain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const near = chain > 0;
    const close = 1 - clamp01(gap / A.passRange);
    this.sweep(t, 2800, 650, 0.28, near ? A.nearWhoosh : A.passWhoosh * close, side * 0.8);
    if (near) this.bell(this.music.scaleNote(chain - 1, ROOT_MIDI + 24), t, A.chain, side * 0.3, 0.7, 2);
  }

  pickup(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const m = this.music;
    this.bell(m.scaleNote(7, ROOT_MIDI + 24), t, A.pickup, 0, 0.6, 2);
    this.bell(m.scaleNote(9, ROOT_MIDI + 24), t + 0.08, A.pickup, 0, 0.9, 2);
    this.bell(m.scaleNote(12, ROOT_MIDI + 24), t + 0.16, A.pickup * 0.4, 0, 1.2, 2);
  }

  boostStart(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.glide(t, 500, 1700, 0.4, A.boost * 0.4);
    this.sweep(t, 350, 2600, 0.45, A.boost, 0);
  }

  /** Boost released, or `empty` when it ran out (adds a sputter). */
  boostEnd(empty: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.glide(t, 1500, 420, 0.35, A.boost * 0.25);
    if (empty) {
      for (let i = 0; i < 3; i++) this.burst(t + 0.05 + i * 0.09, 900 - i * 200, A.boost * (0.5 - i * 0.12), 0.05);
    }
  }

  /** Passing through a doorway in the ship: a pneumatic hiss and a soft thunk. */
  door(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.sweep(t, 5200, 1400, 0.5, A.door, 0);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.2);
    const g = ctx.createGain();
    pluckEnv(g.gain, t, A.door * 0.8, 0.004, 0.25);
    o.connect(g).connect(this.sfxBus);
    g.connect(this.reverbSend);
    o.start(t);
    o.stop(t + 0.4);
  }

  /** New level: a bell arpeggio from the chord. A theme change adds a falling wash and a sub drop. */
  level(themeChange: boolean, theme: ThemeId): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (themeChange) {
      this.music.setTheme(theme, true);
      this.sweep(t, 4000, 180, 1.4, A.theme * 0.6, 0);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(92, t);
      o.frequency.exponentialRampToValueAtTime(36, t + 1.4);
      const g = ctx.createGain();
      pluckEnv(g.gain, t, A.theme, 0.02, 1.6);
      o.connect(g).connect(this.sfxBus);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + 2);
    }
    const m = this.music;
    for (let i = 0; i < 3; i++) this.bell(m.scaleNote(i * 2, ROOT_MIDI + 24), t + 0.1 + i * 0.13, A.level, 0, 1.4, 2);
  }

  /** Fell into a pit: a falling whistle, then a distant thud below. */
  fall(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.engineOn = false;
    this.glide(t, 900, 140, 0.9, A.boost * 0.5);
    this.sweep(t, 2400, 300, 0.9, A.boost * 0.6, 0);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t + 0.75);
    o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    pluckEnv(g.gain, t + 0.75, A.crash * 0.4, 0.01, 0.6);
    o.connect(g).connect(this.sfxBus);
    g.connect(this.reverbSend);
    o.start(t);
    o.stop(t + 1.6);
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(A.muffleHz, t + 0.6, 0.4);
  }

  /** Crash: thump, crunch, scattered debris, then everything muffled. */
  crash(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.engineOn = false;

    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    const g = ctx.createGain();
    pluckEnv(g.gain, t, A.crash, 0.002, 0.6);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.8);

    const src = this.noiseSource(this.white);
    const drive = ctx.createWaveShaper();
    drive.curve = driveCurve(4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1600, t);
    bp.frequency.exponentialRampToValueAtTime(300, t + 0.3);
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    pluckEnv(ng.gain, t, A.crash * 0.7, 0.002, 0.35);
    src.connect(drive).connect(bp).connect(ng).connect(this.sfxBus);
    ng.connect(this.reverbSend);
    src.start(t, Math.random());
    src.stop(t + 0.5);

    // Debris: the ship's triangles scattering.
    for (let i = 0; i < 7; i++) {
      const dt = 0.04 + Math.random() * 0.45;
      this.bell(72 + Math.random() * 24, t + dt, A.debris * (1 - dt), Math.random() * 1.6 - 0.8, 0.25, 3.7);
    }

    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(A.muffleHz, t + 0.08, 0.3);
  }

  // --- building blocks -------------------------------------------------------

  private build(): void {
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    // Old iOS needs a sound started inside the gesture to unlock output.
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, 22050);
    blip.connect(ctx.destination);
    blip.start();

    this.white = noiseBuffer(ctx, 2, 'white');
    this.pink = noiseBuffer(ctx, 3, 'pink');
    this.brown = noiseBuffer(ctx, 3, 'brown');

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.5;
    this.muffle.connect(limiter);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : A.master;
    this.master.connect(this.muffle);

    this.musicBus = this.bus(A.musicBus * this.musicLevel);
    this.sfxBus = this.bus(A.sfxBus * this.effectsLevel);
    this.ambBus = this.bus(A.ambienceBus * this.effectsLevel);

    // Reverb
    const conv = ctx.createConvolver();
    conv.buffer = impulseResponse(ctx, 2.4, 3);
    this.reverbSend = ctx.createGain();
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = A.reverbLand;
    this.reverbSend.connect(conv).connect(this.reverbReturn).connect(this.master);
    this.sfxBus.connect(this.reverbSend);

    // Echo: delay with a darkening feedback loop.
    this.echoSend = ctx.createGain();
    this.echoDelay = ctx.createDelay(1.5);
    this.echoDelay.delayTime.value = 0.4;
    this.echoFeedback = ctx.createGain();
    this.echoFeedback.gain.value = 0.3;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2400;
    this.echoReturn = ctx.createGain();
    this.echoReturn.gain.value = A.echoLand;
    this.echoSend.connect(this.echoDelay);
    this.echoDelay.connect(echoTone).connect(this.echoFeedback).connect(this.echoDelay);
    echoTone.connect(this.echoReturn).connect(this.master);

    // Engine body
    this.bodyFilter = ctx.createBiquadFilter();
    this.bodyFilter.type = 'lowpass';
    this.bodyFilter.Q.value = 0.9;
    this.bodyGain = ctx.createGain();
    this.bodyGain.gain.value = 0;
    this.bodyFilter.connect(this.bodyGain).connect(this.ambBus);
    for (const [type, level] of [
      ['triangle', 0.8],
      ['sawtooth', 0.25],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = midiHz(ROOT_MIDI - 12);
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(this.bodyFilter);
      osc.start();
      this.bodyOscs.push(osc);
    }

    // Rumble
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.loop(this.brown).connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.ambBus);

    // Turbine whine with a slow vibrato
    this.whine = ctx.createOscillator();
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.3;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 6;
    vib.connect(vibDepth).connect(this.whine.frequency);
    vib.start();
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain).connect(this.ambBus);
    this.whine.start();

    // Air
    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = 'bandpass';
    this.airFilter.Q.value = 0.7;
    this.airPan = ctx.createStereoPanner();
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0;
    this.loop(this.pink).connect(this.airFilter).connect(this.airPan).connect(this.airGain).connect(this.ambBus);

    // Boost roar
    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'bandpass';
    this.roarFilter.Q.value = 1.1;
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;
    this.loop(this.pink).connect(this.roarFilter).connect(this.roarGain).connect(this.ambBus);

    // Canyon wind: two bands with slow, uneven gusts
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windGain.connect(this.ambBus);
    for (const [freq, q, rate, pan] of [
      [320, 0.8, 0.07, -0.4],
      [900, 2.5, 0.13, 0.4],
    ]) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = freq * 0.45;
      lfo.connect(depth).connect(f.frequency);
      lfo.start();
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      this.loop(this.pink).connect(f).connect(p).connect(this.windGain);
    }
    this.windGain.connect(this.echoSend);

    // Interior hum: 55 Hz with harmonics, faintly unsteady
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.ambBus);
    for (const [f, level] of [
      [55, 1],
      [110, 0.45],
      [165, 0.2],
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(this.humGain);
      osc.start();
    }

    this.music = new Music(ctx, this.musicBus, this.echoSend, this.reverbSend, this.white);
    this.music.start();
  }

  private bus(level: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = level;
    g.connect(this.master);
    return g;
  }

  private loop(buffer: AudioBuffer): AudioBufferSourceNode {
    const src = this.noiseSource(buffer);
    src.loop = true;
    src.start(0, Math.random() * buffer.duration);
    return src;
  }

  private noiseSource(buffer: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  /** Band-passed noise sweeping from `from` to `to` Hz: whooshes and washes. */
  private sweep(t: number, from: number, to: number, len: number, peak: number, pan: number): void {
    const ctx = this.ctx!;
    const src = this.noiseSource(this.white);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + len);
    const g = ctx.createGain();
    pluckEnv(g.gain, t, peak, len * 0.35, len);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + len * 1.6);
  }

  /** Sine glide: turbine spool up/down. */
  private glide(t: number, from: number, to: number, len: number, peak: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + len);
    const g = ctx.createGain();
    pluckEnv(g.gain, t, peak, len * 0.3, len * 1.2);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + len * 2);
  }

  /** Short low-passed noise blip. */
  private burst(t: number, cutoff: number, peak: number, len: number): void {
    const ctx = this.ctx!;
    const src = this.noiseSource(this.white);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    pluckEnv(g.gain, t, peak, 0.002, len);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + len * 2);
  }

  /** FM bell at `midi`. `ratio` 2 = bright and musical, 3.7 = clangy debris. Sends to the echo. */
  private bell(midi: number, t: number, peak: number, pan: number, decay: number, ratio: number): void {
    const ctx = this.ctx!;
    const f = midiHz(midi);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * ratio;
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(f * 1.5, t);
    idx.gain.setTargetAtTime(0, t, decay * 0.15);
    mod.connect(idx).connect(car.frequency);
    const g = ctx.createGain();
    pluckEnv(g.gain, t, peak, 0.003, decay);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    car.connect(g).connect(p).connect(this.sfxBus);
    p.connect(this.echoSend);
    car.start(t);
    mod.start(t);
    car.stop(t + decay * 1.5);
    mod.stop(t + decay * 1.5);
  }

  /** Distant metal creak inside the ship: a resonant ping through lots of reverb. */
  private clank(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSource(this.white);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 180 + Math.random() * 520;
    f.Q.value = 28;
    const g = ctx.createGain();
    pluckEnv(g.gain, t, A.interiorHum * 6, 0.004, 1.6);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    src.connect(f).connect(g).connect(p).connect(this.reverbSend);
    src.start(t, Math.random());
    src.stop(t + 0.3);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

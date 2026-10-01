import { CONFIG } from '../config';
import type { ThemeId } from '../world';
import { midiHz, pluckEnv, ROOT_MIDI } from './synth';

// Generative score. Everything sits in D; each theme has its own mode, chord
// loop and lead timbre. A step sequencer (eighth notes) is advanced from the
// game loop with a short look-ahead, so timing stays sample-accurate even
// though frames don't.
//
//   pad:    chord voicings, one chord per two bars, slow swells
//   bass:   chord root on each bar
//   lead:   sparse plucks from a 2-bar pattern that re-rolls every 4 bars
//   hats:   soft off-beat ticks when intensity or boost is high
//
// Tempo follows speed; density follows intensity (level and speed) and boost;
// brightness follows daylight.

interface ThemeMusic {
  scale: number[]; // semitones above D
  chords: number[][]; // semitones relative to D3
  bell: boolean; // metallic FM lead instead of a soft pluck
}

export const THEME_MUSIC: Record<ThemeId, ThemeMusic> = {
  // D major pentatonic: open and airy.
  land: {
    scale: [0, 2, 4, 7, 9],
    chords: [
      [0, 7, 14, 16],
      [-3, 4, 9, 14],
      [-5, 2, 9, 16],
      [-10, -3, 4, 9],
    ],
    bell: false,
  },
  // D minor pentatonic: earthier, heard through the canyon echo.
  canyon: {
    scale: [0, 3, 5, 7, 10],
    chords: [
      [0, 7, 12, 15],
      [-2, 5, 10, 15],
      [-7, 0, 5, 10],
      [-9, -2, 3, 7],
    ],
    bell: false,
  },
  // D Phrygian colour: darker, with a metallic lead.
  interior: {
    scale: [0, 1, 3, 7, 8],
    chords: [
      [0, 7, 10, 15],
      [1, 8, 13, 17],
      [0, 7, 12, 15],
      [-4, 3, 8, 12],
    ],
    bell: true,
  },
};

const M = CONFIG.audio.music;
const STEPS_PER_BAR = 8;
const LEAD_BASE = ROOT_MIDI + 12; // D4

interface PadVoice {
  gain: GainNode;
  oscs: OscillatorNode[];
}

export class Music {
  private theme: ThemeId = 'land';
  private pendingTheme: ThemeId | null = null;
  private running = false;
  private step = 0;
  private nextTime = 0;
  private padVoices: PadVoice[] = [];
  private readonly pattern = new Uint8Array(16);
  private readonly notes = new Int8Array(16);
  private melodyIndex = 4;

  // Inputs, set every frame by the sound module.
  intensity = 0; // 0..1
  speedNorm = 0; // 0..1
  boost = 0; // 0..1
  daylight = 1; // 0..1
  melody = false; // lead and hats on/off (pad and bass always play)

  private readonly padFilter: BiquadFilterNode;
  private readonly leadFilter: BiquadFilterNode;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    delaySend: AudioNode,
    private readonly reverbSend: AudioNode,
    private readonly noise: AudioBuffer,
  ) {
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 1200;
    this.padFilter.connect(out);
    this.padFilter.connect(reverbSend);
    this.leadFilter = ctx.createBiquadFilter();
    this.leadFilter.type = 'lowpass';
    this.leadFilter.frequency.value = 3000;
    this.leadFilter.connect(out);
    this.leadFilter.connect(delaySend);
  }

  get currentTheme(): ThemeId {
    return this.pendingTheme ?? this.theme;
  }

  /** Length of one beat (quarter note) at the current tempo, in seconds. */
  beatSeconds(): number {
    return 60 / this.bpm();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.rollPattern();
  }

  /** Switch mode at the next bar (or now, if `now`). */
  setTheme(theme: ThemeId, now = false): void {
    if (theme === this.theme && !this.pendingTheme) return;
    this.pendingTheme = theme;
    if (now) this.step = Math.ceil(this.step / STEPS_PER_BAR) * STEPS_PER_BAR;
  }

  /** Scale note for the n-th position (0 = D), climbing octaves every 5 steps. */
  scaleNote(n: number, base = LEAD_BASE): number {
    const s = THEME_MUSIC[this.currentTheme].scale;
    return base + 12 * Math.floor(n / s.length) + s[((n % s.length) + s.length) % s.length];
  }

  /** Current chord (semitones relative to D3). */
  chord(): number[] {
    const chords = THEME_MUSIC[this.theme].chords;
    return chords[Math.floor(this.step / (STEPS_PER_BAR * 2)) % chords.length];
  }

  /** Schedule everything due before now + look-ahead. Call every frame. */
  schedule(): void {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const dayCut = 500 + 1600 * this.daylight;
    this.padFilter.frequency.setTargetAtTime(dayCut + this.boost * 500, t, 0.5);
    this.leadFilter.frequency.setTargetAtTime(1600 + 2600 * this.daylight + this.boost * 1500, t, 0.3);
    // If the tab stalled, don't try to catch up a pile of notes.
    if (this.nextTime < t - 0.2) this.nextTime = t + 0.05;
    while (this.nextTime < t + 0.15) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.beatSeconds() / 2;
      this.step++;
    }
  }

  private bpm(): number {
    return M.bpmMin + (M.bpmMax - M.bpmMin) * this.speedNorm + M.bpmBoost * this.boost;
  }

  private playStep(step: number, t: number): void {
    const pos = step % STEPS_PER_BAR;
    const bar = Math.floor(step / STEPS_PER_BAR);
    if (pos === 0) {
      if (this.pendingTheme) {
        this.theme = this.pendingTheme;
        this.pendingTheme = null;
      }
      if (bar % 2 === 0) this.pad(this.chord(), t);
      this.bass(this.chord()[0], t);
      if (bar % 4 === 0) this.rollPattern();
    }
    if (this.melody) {
      const i = step % 16;
      if (this.pattern[i]) this.lead(this.scaleNote(this.notes[i]), t);
      if (pos % 2 === 1 && (this.intensity > 0.55 || this.boost > 0.3)) this.hat(t, pos === 3 || pos === 7);
    }
  }

  /** New 2-bar lead rhythm and melody: a random walk over two octaves of the mode. */
  private rollPattern(): void {
    const density = M.leadDensity + M.leadDensityIntensity * this.intensity + M.leadDensityBoost * this.boost;
    for (let i = 0; i < 16; i++) {
      const accent = i % 8 === 0 ? 1.4 : i % 2 === 0 ? 1.1 : 0.6;
      this.pattern[i] = Math.random() < density * accent ? 1 : 0;
      const r = Math.random();
      const move = r < 0.35 ? -1 : r < 0.7 ? 1 : r < 0.82 ? -2 : r < 0.94 ? 2 : 0;
      this.melodyIndex = Math.max(0, Math.min(9, this.melodyIndex + move));
      this.notes[i] = this.melodyIndex;
    }
  }

  private pad(chord: number[], t: number): void {
    const ctx = this.ctx;
    for (const v of this.padVoices) {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, 0.9);
      for (const o of v.oscs) o.stop(t + 5);
    }
    this.padVoices = [];
    const level = M.pad / chord.length;
    for (const semi of chord) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(level, t + 1.6);
      gain.connect(this.padFilter);
      const oscs: OscillatorNode[] = [];
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midiHz(ROOT_MIDI + semi);
        o.detune.value = detune;
        o.connect(gain);
        o.start(t);
        oscs.push(o);
      }
      this.padVoices.push({ gain, oscs });
    }
  }

  private bass(semi: number, t: number): void {
    const ctx = this.ctx;
    const f = midiHz(ROOT_MIDI - 12 + ((semi % 12) + 12) % 12);
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2;
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    pluckEnv(g.gain, t, M.bass, 0.02, 1.8);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.padFilter);
    o.start(t);
    o2.start(t);
    o.stop(t + 2.2);
    o2.stop(t + 2.2);
  }

  private lead(midi: number, t: number): void {
    const ctx = this.ctx;
    const f = midiHz(midi);
    const g = ctx.createGain();
    if (THEME_MUSIC[this.theme].bell) {
      // FM bell with an inharmonic ratio: cold and metallic.
      const car = ctx.createOscillator();
      car.frequency.value = f;
      const mod = ctx.createOscillator();
      mod.frequency.value = f * 3.5;
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(f * 2, t);
      idx.gain.setTargetAtTime(0, t, 0.12);
      mod.connect(idx).connect(car.frequency);
      pluckEnv(g.gain, t, M.lead * 0.8, 0.004, 1.2);
      car.connect(g);
      g.connect(this.leadFilter);
      g.connect(this.reverbSend);
      car.start(t);
      mod.start(t);
      car.stop(t + 1.5);
      mod.stop(t + 1.5);
    } else {
      // Soft pluck: triangle with a quiet sine an octave up.
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const o2 = ctx.createOscillator();
      o2.frequency.value = f * 2;
      const g2 = ctx.createGain();
      g2.gain.value = 0.2;
      pluckEnv(g.gain, t, M.lead, 0.006, 0.55);
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(this.leadFilter);
      o.start(t);
      o2.start(t);
      o.stop(t + 0.8);
      o2.stop(t + 0.8);
    }
  }

  private hat(t: number, accent: boolean): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    pluckEnv(g.gain, t, M.hats * (accent ? 1 : 0.6), 0.001, 0.05);
    src.connect(hp).connect(g).connect(this.out); // not through the pad's low-pass
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.08);
  }
}

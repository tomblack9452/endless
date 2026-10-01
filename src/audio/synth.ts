// Small synthesis helpers shared by the sound and music modules.

export const ROOT_MIDI = 50; // D3. Everything in the game is in D.

export function midiHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export type NoiseColour = 'white' | 'pink' | 'brown';

export function noiseBuffer(ctx: BaseAudioContext, seconds: number, colour: NoiseColour): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (colour === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (colour === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  } else {
    // Paul Kellet's economy pink filter.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
  }
  return buf;
}

/**
 * Stereo reverb impulse: decaying noise, darkened over time by a one-pole
 * low-pass whose cutoff falls as the tail goes on (like real rooms).
 */
export function impulseResponse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.55 - 0.45 * t; // brightness falls with time
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

/** Soft-clip curve for a WaveShaperNode. */
export function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

/**
 * Percussive envelope on `param`: ramp to `peak` over `attack`, then decay
 * towards silence with roughly `decay` seconds of audible tail.
 */
export function pluckEnv(param: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(0.0001, t + attack, decay / 4);
}

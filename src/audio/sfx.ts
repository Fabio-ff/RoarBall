import type { SfxName } from './sink';

export interface Voice {
  ctx: BaseAudioContext;
  out: AudioNode;
  t: number;
  gain: number;
  noise: AudioBuffer;
}
/** Builds one sound into `v.out` starting at `v.t`; returns its length in seconds. */
export type Patch = (v: Voice) => number;

/** One second of white noise, shared by every noise patch. */
export function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Presentation only (spec §3 bans Math.random in the sim, not here).
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

const FLOOR = 0.0001;

/** Attack/decay envelope on a fresh gain node feeding `out`. */
function envelope(v: Voice, start: number, dur: number, peak: number, attack = 0.005): GainNode {
  const g = v.ctx.createGain();
  const t0 = v.t + start;
  g.gain.setValueAtTime(FLOOR, t0);
  g.gain.linearRampToValueAtTime(Math.max(FLOOR, peak * v.gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);
  g.connect(v.out);
  return g;
}

export interface ToneSpec {
  type: OscillatorType;
  freq: number;
  freqEnd?: number;
  start?: number;
  dur: number;
  peak: number;
  attack?: number;
}

export function tone(v: Voice, s: ToneSpec): void {
  const start = s.start ?? 0;
  const osc = v.ctx.createOscillator();
  osc.type = s.type;
  osc.frequency.setValueAtTime(s.freq, v.t + start);
  if (s.freqEnd !== undefined)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, s.freqEnd), v.t + start + s.dur);
  osc.connect(envelope(v, start, s.dur, s.peak, s.attack));
  osc.start(v.t + start);
  osc.stop(v.t + start + s.dur + 0.02);
}

export interface NoiseSpec {
  filter: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  start?: number;
  dur: number;
  peak: number;
  attack?: number;
}

export function noiseBurst(v: Voice, s: NoiseSpec): void {
  const start = s.start ?? 0;
  const src = v.ctx.createBufferSource();
  src.buffer = v.noise;
  src.loop = true;
  const f = v.ctx.createBiquadFilter();
  f.type = s.filter;
  f.frequency.setValueAtTime(s.freq, v.t + start);
  if (s.freqEnd !== undefined)
    f.frequency.exponentialRampToValueAtTime(Math.max(1, s.freqEnd), v.t + start + s.dur);
  f.Q.setValueAtTime(s.q ?? 1, v.t + start);
  src.connect(f);
  f.connect(envelope(v, start, s.dur, s.peak, s.attack));
  src.start(v.t + start);
  src.stop(v.t + start + s.dur + 0.02);
}

/** Spec E.4 sound list. Durations are the patch's last envelope end. */
export const SFX_PATCHES: Record<SfxName, Patch> = {
  bounce: (v) => {
    tone(v, { type: 'sine', freq: 140, freqEnd: 55, dur: 0.18, peak: 0.9 });
    noiseBurst(v, { filter: 'lowpass', freq: 900, dur: 0.05, peak: 0.25 });
    return 0.2;
  },
  swish: (v) => {
    noiseBurst(v, {
      filter: 'bandpass',
      freq: 2500,
      freqEnd: 6000,
      q: 0.8,
      dur: 0.35,
      peak: 0.5,
      attack: 0.06,
    });
    return 0.37;
  },
  rim: (v) => {
    tone(v, { type: 'square', freq: 520, dur: 0.35, peak: 0.18 });
    tone(v, { type: 'sine', freq: 1310, dur: 0.5, peak: 0.25 });
    tone(v, { type: 'sine', freq: 2290, dur: 0.25, peak: 0.12 });
    return 0.52;
  },
  board: (v) => {
    tone(v, { type: 'triangle', freq: 180, freqEnd: 90, dur: 0.15, peak: 0.6 });
    noiseBurst(v, { filter: 'lowpass', freq: 1500, dur: 0.08, peak: 0.35 });
    return 0.17;
  },
  squeak: (v) => {
    tone(v, { type: 'sawtooth', freq: 1900, freqEnd: 2600, dur: 0.09, peak: 0.08, attack: 0.01 });
    return 0.11;
  },
  pass: (v) => {
    noiseBurst(v, {
      filter: 'bandpass',
      freq: 800,
      freqEnd: 2200,
      q: 1.5,
      dur: 0.18,
      peak: 0.35,
      attack: 0.03,
    });
    return 0.2;
  },
  steal: (v) => {
    noiseBurst(v, { filter: 'highpass', freq: 3000, dur: 0.06, peak: 0.5 });
    tone(v, { type: 'square', freq: 660, freqEnd: 990, dur: 0.12, peak: 0.15 });
    return 0.14;
  },
  block: (v) => {
    tone(v, { type: 'sine', freq: 110, freqEnd: 45, dur: 0.3, peak: 1 });
    noiseBurst(v, { filter: 'lowpass', freq: 2000, freqEnd: 300, dur: 0.25, peak: 0.6 });
    return 0.32;
  },
  shove: (v) => {
    tone(v, { type: 'sine', freq: 90, freqEnd: 40, dur: 0.25, peak: 0.9 });
    noiseBurst(v, { filter: 'lowpass', freq: 600, dur: 0.15, peak: 0.4 });
    return 0.27;
  },
  dunk: (v) => {
    noiseBurst(v, { filter: 'lowpass', freq: 3000, freqEnd: 200, dur: 0.4, peak: 0.9 });
    tone(v, { type: 'sine', freq: 70, freqEnd: 30, dur: 0.6, peak: 1, attack: 0.01 });
    tone(v, { type: 'square', freq: 420, dur: 0.3, peak: 0.12 });
    return 0.62;
  },
  crowd: (v) => {
    noiseBurst(v, { filter: 'bandpass', freq: 900, q: 0.6, dur: 1.6, peak: 0.35, attack: 0.25 });
    return 1.62;
  },
  crowdBig: (v) => {
    noiseBurst(v, { filter: 'bandpass', freq: 1000, q: 0.5, dur: 2.6, peak: 0.55, attack: 0.2 });
    noiseBurst(v, {
      filter: 'bandpass',
      freq: 2400,
      q: 1.2,
      start: 0.1,
      dur: 2.2,
      peak: 0.2,
      attack: 0.3,
    });
    return 2.62;
  },
  buzzer: (v) => {
    tone(v, { type: 'sawtooth', freq: 220, dur: 0.9, peak: 0.25, attack: 0.01 });
    tone(v, { type: 'square', freq: 223, dur: 0.9, peak: 0.15, attack: 0.01 });
    return 0.92;
  },
  rocketDunk: (v) => {
    noiseBurst(v, {
      filter: 'bandpass',
      freq: 300,
      freqEnd: 4000,
      q: 2,
      dur: 0.9,
      peak: 0.6,
      attack: 0.3,
    });
    tone(v, { type: 'sawtooth', freq: 110, freqEnd: 880, dur: 0.9, peak: 0.15, attack: 0.2 });
    return 0.92;
  },
  hotHand: (v) => {
    noiseBurst(v, { filter: 'highpass', freq: 5000, dur: 0.8, peak: 0.3, attack: 0.05 });
    tone(v, { type: 'triangle', freq: 660, start: 0, dur: 0.15, peak: 0.3 });
    tone(v, { type: 'triangle', freq: 880, start: 0.12, dur: 0.15, peak: 0.3 });
    tone(v, { type: 'triangle', freq: 1320, start: 0.24, dur: 0.3, peak: 0.3 });
    return 0.82;
  },
  blur: (v) => {
    tone(v, { type: 'sawtooth', freq: 300, freqEnd: 2400, dur: 0.25, peak: 0.2 });
    noiseBurst(v, { filter: 'bandpass', freq: 1500, freqEnd: 6000, q: 3, dur: 0.3, peak: 0.3 });
    return 0.32;
  },
  earthquake: (v) => {
    tone(v, { type: 'sine', freq: 45, freqEnd: 28, dur: 1.4, peak: 1, attack: 0.02 });
    noiseBurst(v, { filter: 'lowpass', freq: 250, dur: 1.2, peak: 0.8, attack: 0.02 });
    noiseBurst(v, { filter: 'bandpass', freq: 1200, q: 0.7, start: 0.05, dur: 0.6, peak: 0.25 });
    return 1.42;
  },
  menuMove: (v) => {
    tone(v, { type: 'square', freq: 880, dur: 0.05, peak: 0.08 });
    return 0.07;
  },
  menuConfirm: (v) => {
    tone(v, { type: 'square', freq: 660, dur: 0.08, peak: 0.1 });
    tone(v, { type: 'square', freq: 990, start: 0.07, dur: 0.12, peak: 0.1 });
    return 0.21;
  },
};

import { noiseBurst, tone, type Voice } from './sfx';
import { degreeToMidi, midiToHz, type Instrument, type Track } from './tracks';

export interface Timers {
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

const LOOKAHEAD_S = 0.1;
const TICK_MS = 25;
/** First note starts a little after play() so it is never scheduled in the past. */
const START_DELAY_S = 0.05;

export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

export function stepsToSchedule(
  nextStepTime: number,
  now: number,
  lookahead: number,
  stepDur: number,
): number {
  const horizon = now + lookahead;
  if (nextStepTime >= horizon) return 0;
  return Math.floor((horizon - nextStepTime - 1e-9) / stepDur) + 1;
}

/** Look-ahead step sequencer (plan decision 23): a 25 ms timer schedules the next 100 ms of notes. */
export class MusicPlayer {
  private track: Track | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    private readonly noise: AudioBuffer,
    private readonly timers: Timers = {
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (id) => window.clearInterval(id),
    },
  ) {}

  get playing(): Track | null {
    return this.track;
  }

  play(track: Track | null): void {
    if (track !== null && track === this.track && track.loop) return;
    this.stop();
    if (!track) return;
    this.track = track;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + START_DELAY_S;
    this.timer = this.timers.setInterval(() => this.tick(), TICK_MS);
  }

  tick(): void {
    const track = this.track;
    if (!track) return;
    const dur = stepSeconds(track.bpm);
    const total = track.bars * 16;
    const now = this.ctx.currentTime;
    if (this.nextTime < now) {
      // The timer was throttled (hidden tab, long stall): skip the missed steps instead of
      // scheduling them all in the past at once.
      const skip = Math.ceil((now - this.nextTime) / dur);
      this.step += skip;
      this.nextTime += skip * dur;
      if (track.loop) this.step %= total;
      else if (this.step >= total) {
        this.stop();
        return;
      }
    }
    const n = stepsToSchedule(this.nextTime, this.ctx.currentTime, LOOKAHEAD_S, dur);
    for (let i = 0; i < n; i++) {
      if (this.step >= total) {
        if (!track.loop) {
          this.stop();
          return;
        }
        this.step = 0;
      }
      this.playStep(track, this.step, this.nextTime, dur);
      this.step += 1;
      this.nextTime += dur;
    }
  }

  stop(): void {
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
    this.track = null;
  }

  private playStep(track: Track, step: number, t: number, dur: number): void {
    const v: Voice = { ctx: this.ctx, out: this.out, t, gain: 1, noise: this.noise };
    const hit = (i: Instrument): number | null => track.steps[i]?.[step] ?? null;
    if (hit('kick') !== null)
      tone(v, { type: 'sine', freq: 150, freqEnd: 45, dur: 0.22, peak: 0.9 });
    if (hit('snare') !== null)
      noiseBurst(v, { filter: 'bandpass', freq: 1800, q: 0.8, dur: 0.14, peak: 0.45 });
    if (hit('hat') !== null)
      noiseBurst(v, { filter: 'highpass', freq: 7000, dur: 0.04, peak: 0.18 });
    const bass = hit('bass');
    if (bass !== null)
      tone(v, {
        type: 'sawtooth',
        freq: midiToHz(degreeToMidi(track, bass)),
        dur: dur * 1.8,
        peak: 0.28,
        attack: 0.01,
      });
    const lead = hit('lead');
    if (lead !== null)
      tone(v, {
        type: 'square',
        freq: midiToHz(degreeToMidi(track, lead) + 12),
        dur: dur * 1.6,
        peak: 0.12,
        attack: 0.01,
      });
  }
}

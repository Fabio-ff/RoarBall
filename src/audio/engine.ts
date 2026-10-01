import { makeNoiseBuffer, SFX_PATCHES } from './sfx';
import type { AudioSink, SfxName } from './sink';

export const MAX_VOICES = 12;
/** Fixed mix (spec E.2: volumes are constants until the audio overhaul). */
export const MIX = { master: 0.9, sfx: 0.8, music: 0.45 } as const;

/** Web Audio implementation of the AudioSink seam (spec E.4, plan decisions 18–20). */
export class AudioEngine implements AudioSink {
  readonly musicBus: GainNode;
  private readonly master: GainNode;
  private readonly sfxBus: GainNode;
  private readonly noise: AudioBuffer;
  private readonly voices: { node: GainNode; end: number }[] = [];
  private sound = true;
  private music = true;

  constructor(readonly context: AudioContext) {
    this.master = context.createGain();
    this.master.gain.value = MIX.master;
    this.master.connect(context.destination);
    this.sfxBus = context.createGain();
    this.sfxBus.gain.value = MIX.sfx;
    this.sfxBus.connect(this.master);
    this.musicBus = context.createGain();
    this.musicBus.gain.value = MIX.music;
    this.musicBus.connect(this.master);
    this.noise = makeNoiseBuffer(context);
  }

  /** Null where Web Audio is unavailable; call inside a user gesture (iOS). */
  static create(): AudioEngine | null {
    const Ctor =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    try {
      const engine = new AudioEngine(new Ctor());
      engine.resume();
      return engine;
    } catch {
      return null;
    }
  }

  resume(): void {
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  playSfx(name: SfxName, gain = 1): void {
    if (!this.sound) return;
    const t = this.context.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--)
      if ((this.voices[i]?.end ?? 0) <= t) this.voices.splice(i, 1);
    const node = this.context.createGain();
    (node as unknown as { voice: boolean }).voice = true; // marks voice nodes for tests and debugging
    node.connect(this.sfxBus);
    const duration = SFX_PATCHES[name]({
      ctx: this.context,
      out: node,
      t,
      gain,
      noise: this.noise,
    });
    this.voices.push({ node, end: t + duration });
    while (this.voices.length > MAX_VOICES) this.voices.shift()?.node.disconnect();
  }

  /** Task 6 plays tracks through the MusicPlayer; until then music is silent. */
  setMusic(): void {}

  duck(seconds: number): void {
    const g = this.musicBus.gain;
    const t = this.context.currentTime;
    const level = this.music ? MIX.music : 0;
    g.cancelScheduledValues(t);
    g.setValueAtTime(level * 0.35, t);
    g.linearRampToValueAtTime(level, t + seconds);
  }

  setEnabled(sound: boolean, music: boolean): void {
    this.sound = sound;
    this.music = music;
    this.master.gain.setValueAtTime(sound || music ? MIX.master : 0, this.context.currentTime);
    this.sfxBus.gain.setValueAtTime(sound ? MIX.sfx : 0, this.context.currentTime);
    this.musicBus.gain.setValueAtTime(music ? MIX.music : 0, this.context.currentTime);
  }

  dispose(): void {
    for (const v of this.voices) v.node.disconnect();
    this.voices.length = 0;
    void this.context.close().catch(() => undefined);
  }
}

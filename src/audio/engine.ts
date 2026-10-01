import { makeNoiseBuffer, SFX_PATCHES } from './sfx';
import { MusicPlayer, type Timers } from './sequencer';
import type { AudioSink, SfxName, TrackId } from './sink';
import { TRACKS } from './tracks';

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
  private readonly player: MusicPlayer;
  private wanted: TrackId | null = null;
  /** True once the wanted track has been started, so a finished jingle is not replayed. */
  private started = false;

  constructor(
    readonly context: AudioContext,
    timers?: Timers,
  ) {
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
    this.player = new MusicPlayer(context, this.musicBus, this.noise, timers);
  }

  /** The track the sequencer is playing right now (null when silent or music is off). */
  get musicPlaying(): TrackId | null {
    const track = this.player.playing;
    return this.wanted !== null && track === TRACKS[this.wanted] ? this.wanted : null;
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

  /** Remembers the wanted track; it plays only while music is on. */
  setMusic(track: TrackId | null): void {
    this.wanted = track;
    this.started = false;
    this.syncMusic();
  }

  private syncMusic(): void {
    const track = this.wanted ? TRACKS[this.wanted] : null;
    if (!this.music || !track) return this.player.play(null);
    if (!track.loop && this.started) return; // a jingle plays once per setMusic
    this.started = true;
    this.player.play(track);
  }

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
    const t = this.context.currentTime;
    // Cancel first so a pending duck ramp cannot raise the bus after it is switched off.
    for (const g of [this.master.gain, this.sfxBus.gain, this.musicBus.gain])
      g.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(sound || music ? MIX.master : 0, t);
    this.sfxBus.gain.setValueAtTime(sound ? MIX.sfx : 0, t);
    this.musicBus.gain.setValueAtTime(music ? MIX.music : 0, t);
    this.syncMusic();
  }

  dispose(): void {
    this.player.stop();
    for (const v of this.voices) v.node.disconnect();
    this.voices.length = 0;
    void this.context.close().catch(() => undefined);
  }
}

export type SfxName =
  | 'bounce'
  | 'swish'
  | 'rim'
  | 'board'
  | 'squeak'
  | 'pass'
  | 'steal'
  | 'block'
  | 'shove'
  | 'dunk'
  | 'crowd'
  | 'crowdBig'
  | 'buzzer'
  | 'rocketDunk'
  | 'hotHand'
  | 'blur'
  | 'earthquake'
  | 'menuMove'
  | 'menuConfirm';

export const SFX_NAMES: readonly SfxName[] = [
  'bounce',
  'swish',
  'rim',
  'board',
  'squeak',
  'pass',
  'steal',
  'block',
  'shove',
  'dunk',
  'crowd',
  'crowdBig',
  'buzzer',
  'rocketDunk',
  'hotHand',
  'blur',
  'earthquake',
  'menuMove',
  'menuConfirm',
];

export type TrackId = 'menu' | 'gym' | 'rooftop' | 'volcano' | 'frozen' | 'win' | 'lose';

/** The seam between game code and Web Audio: the shell swaps a null sink for the real engine. */
export interface AudioSink {
  playSfx(name: SfxName, gain?: number): void;
  setMusic(track: TrackId | null): void;
  duck(seconds: number): void;
  setEnabled(sound: boolean, music: boolean): void;
}

export class NullAudioSink implements AudioSink {
  playSfx(): void {}
  setMusic(): void {}
  duck(): void {}
  setEnabled(): void {}
}

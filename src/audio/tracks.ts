import type { TrackId } from './sink';

export type Instrument = 'kick' | 'snare' | 'hat' | 'bass' | 'lead';

export interface Track {
  bpm: number;
  bars: number;
  loop: boolean;
  /** MIDI note of scale degree 0. */
  root: number;
  scale: readonly number[];
  steps: Partial<Record<Instrument, readonly (number | null)[]>>;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function degreeToMidi(track: Pick<Track, 'root' | 'scale'>, degree: number): number {
  const n = track.scale.length;
  const octave = Math.floor(degree / n);
  return track.root + 12 * octave + (track.scale[((degree % n) + n) % n] ?? 0);
}

/** `'x...x...'` → hits; `'0.2.4...'` → degrees. One string per bar of 16 steps. */
function lane(...bars: string[]): (number | null)[] {
  return bars.flatMap((bar) => {
    if (bar.length !== 16) throw new Error(`bar must have 16 steps: ${bar}`);
    return [...bar].map((ch) => (ch === '.' ? null : ch === 'x' ? 1 : Number.parseInt(ch, 36)));
  });
}
const repeat = (bar: string, times: number): string[] => Array.from({ length: times }, () => bar);

const MINOR_PENT = [0, 3, 5, 7, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export const TRACKS: Record<TrackId, Track> = {
  gym: {
    bpm: 112,
    bars: 4,
    loop: true,
    root: 45 /* A2 */,
    scale: MINOR_PENT,
    steps: {
      kick: lane(...repeat('x.....x...x.....', 4)),
      snare: lane(...repeat('....x.......x...', 4)),
      hat: lane(...repeat('x.x.x.x.x.x.x.xx', 4)),
      bass: lane('0..0..3.0..0.4.3', '0..0..3.0..0.2.1', '0..0..3.0..0.4.3', '2..2..4.2..1.0..'),
      lead: lane('a...c.d...c.a...', '........a.c.d.f.', 'a...c.d...c.a...', 'f.d.c.a.........'),
    },
  },
  rooftop: {
    bpm: 132,
    bars: 4,
    loop: true,
    root: 40 /* E2 */,
    scale: MINOR,
    steps: {
      kick: lane(...repeat('x...x...x...x...', 4)),
      snare: lane(...repeat('....x.......x..x', 4)),
      hat: lane(...repeat('.x.x.x.x.x.x.x.x', 4)),
      bass: lane('0000000000000000', '5555555555555555', '3333333333333333', '4444444444442222'),
      lead: lane('7...7.9.a...9.7.', '7...7.9.a...c...', 'a...9...7...5...', '4...5...7.......'),
    },
  },
  volcano: {
    bpm: 100,
    bars: 4,
    loop: true,
    root: 38 /* D2 */,
    scale: MINOR,
    steps: {
      kick: lane(...repeat('x..x..x.x.......', 4)),
      snare: lane(...repeat('........x.......', 4)),
      hat: lane(...repeat('x...x...x...x...', 4)),
      bass: lane('0..0..0.1..0....', '0..0..0.5..4....', '0..0..0.1..0....', '3..3..2.1..0....'),
      lead: lane('7.......8...7...', '................', '7.......8...a...', '9...8...7.......'),
    },
  },
  frozen: {
    bpm: 120,
    bars: 4,
    loop: true,
    root: 48 /* C3 */,
    scale: MAJOR,
    steps: {
      kick: lane(...repeat('x.......x.......', 4)),
      snare: lane(...repeat('....x.......x...', 4)),
      hat: lane(...repeat('..x...x...x...x.', 4)),
      bass: lane('0...0...4...4...', '5...5...3...3...', '0...0...4...4...', '5...5...6...4...'),
      lead: lane('7.9.b.e.b.9.7...', '8.a.c.f.c.a.8...', '7.9.b.e.b.9.7...', '9.b.e.g.e.b.9...'),
    },
  },
  menu: {
    bpm: 96,
    bars: 4,
    loop: true,
    root: 41 /* F2 */,
    scale: MAJOR,
    steps: {
      kick: lane(...repeat('x.......x.......', 4)),
      hat: lane(...repeat('..x...x...x...x.', 4)),
      bass: lane('0.......4.......', '5.......3.......', '0.......4.......', '1.......4.......'),
      lead: lane('7...9...b...9...', 'c...b...9...7...', '7...9...b...e...', 'b.......9.......'),
    },
  },
  win: {
    bpm: 140,
    bars: 2,
    loop: false,
    root: 48,
    scale: MAJOR,
    steps: {
      kick: lane('x...x...x...x...', 'x...............'),
      snare: lane('............xxxx', 'x...............'),
      lead: lane('7.7.9.b.e...b.e.', 'g...............'),
      bass: lane('0...0...4...4...', '0...............'),
    },
  },
  lose: {
    bpm: 90,
    bars: 2,
    loop: false,
    root: 45,
    scale: MINOR,
    steps: {
      kick: lane('x.......x.......', 'x...............'),
      lead: lane('7...6...5...4...', '2...............'),
      bass: lane('0.......5.......', '3...............'),
    },
  },
};

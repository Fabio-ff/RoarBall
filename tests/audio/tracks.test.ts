import { describe, expect, it } from 'vitest';
import { degreeToMidi, midiToHz, TRACKS } from '../../src/audio/tracks';

describe('tracks (plan decision 22)', () => {
  it('has every TrackId with the decided tempos and lane lengths of bars × 16', () => {
    expect(Object.keys(TRACKS).sort()).toEqual([
      'frozen',
      'gym',
      'lose',
      'menu',
      'rooftop',
      'volcano',
      'win',
    ]);
    expect([
      TRACKS.gym.bpm,
      TRACKS.rooftop.bpm,
      TRACKS.volcano.bpm,
      TRACKS.frozen.bpm,
      TRACKS.menu.bpm,
    ]).toEqual([112, 132, 100, 120, 96]);
    for (const [id, track] of Object.entries(TRACKS)) {
      expect(track.loop, id).toBe(id !== 'win' && id !== 'lose');
      expect(track.bars, id).toBe(track.loop ? 4 : 2);
      for (const lane of Object.values(track.steps)) expect(lane?.length, id).toBe(track.bars * 16);
    }
  });
  it('maps scale degrees to MIDI and Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    const t = { ...TRACKS.gym, root: 57, scale: [0, 3, 5, 7, 10] };
    expect(degreeToMidi(t, 0)).toBe(57);
    expect(degreeToMidi(t, 2)).toBe(62);
    expect(degreeToMidi(t, 5)).toBe(69); // wraps an octave up
  });
});

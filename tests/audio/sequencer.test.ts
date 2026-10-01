import { describe, expect, it } from 'vitest';
import { MusicPlayer, stepSeconds, stepsToSchedule } from '../../src/audio/sequencer';
import { TRACKS } from '../../src/audio/tracks';
import { fakeAudioContext } from './fake-context';

describe('sequencer timing (plan decision 23)', () => {
  it('a 16th note at 120 bpm is 0.125 s', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125);
  });
  it('schedules every step that starts before now + lookahead', () => {
    expect(stepsToSchedule(1.0, 1.0, 0.1, 0.125)).toBe(1);
    expect(stepsToSchedule(1.0, 0.85, 0.1, 0.125)).toBe(0);
    expect(stepsToSchedule(1.0, 1.2, 0.1, 0.125)).toBe(3); // 1.0, 1.125, 1.25 < 1.3
    expect(stepsToSchedule(2.0, 1.0, 0.1, 0.125)).toBe(0);
  });
});

describe('MusicPlayer', () => {
  const timers = () => {
    const fns: (() => void)[] = [];
    return {
      fns,
      setInterval: (fn: () => void) => (fns.push(fn), fns.length),
      clearInterval: (id: number) => void (fns[id - 1] = () => undefined),
    };
  };
  const make = (t: ReturnType<typeof timers>, time = 0) => {
    const ctx = fakeAudioContext(time);
    const player = new MusicPlayer(
      ctx as unknown as BaseAudioContext,
      ctx.createGain() as unknown as AudioNode,
      ctx.createBuffer(1, 10, 48_000) as unknown as AudioBuffer,
      t,
    );
    return { ctx, player };
  };

  it('schedules notes ahead as time advances and loops a looping track', () => {
    const t = timers();
    const { ctx, player } = make(t);
    player.play(TRACKS.gym);
    const loopSeconds = TRACKS.gym.bars * 16 * stepSeconds(TRACKS.gym.bpm);
    for (let time = 0; time < loopSeconds * 2; time += 0.025) {
      ctx.currentTime = time;
      t.fns.forEach((fn) => fn());
    }
    const starts = ctx.nodes.filter((n) => n.started !== null).map((n) => n.started as number);
    expect(Math.max(...starts)).toBeGreaterThan(loopSeconds); // kept going past one loop
    expect(starts.every((s) => s >= 0)).toBe(true);
  });

  it('a one-shot jingle stops after its last bar; stop() and play(null) silence it', () => {
    const t = timers();
    const { ctx, player } = make(t);
    player.play(TRACKS.win);
    const len = TRACKS.win.bars * 16 * stepSeconds(TRACKS.win.bpm);
    for (let time = 0; time < len * 3; time += 0.025) {
      ctx.currentTime = time;
      t.fns.forEach((fn) => fn());
    }
    const starts = ctx.nodes.filter((n) => n.started !== null).map((n) => n.started as number);
    expect(Math.max(...starts)).toBeLessThan(len + 0.01);
    expect(player.playing).toBeNull();
    player.play(TRACKS.menu);
    player.play(null);
    expect(player.playing).toBeNull();
  });

  it('play() of the same looping track keeps playing without a restart', () => {
    const { player } = make(timers());
    player.play(TRACKS.menu);
    const first = player.playing;
    player.play(TRACKS.menu);
    expect(player.playing).toBe(first);
  });

  it('stop() clears the interval so nothing leaks', () => {
    const t = timers();
    const { ctx, player } = make(t);
    player.play(TRACKS.menu);
    player.stop();
    const before = ctx.nodes.length;
    ctx.currentTime = 5;
    t.fns.forEach((fn) => fn());
    expect(ctx.nodes.length).toBe(before);
  });
});

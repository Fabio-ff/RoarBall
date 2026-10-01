/** Just enough of Web Audio to run patches and the engine in Node: nodes record their wiring. */
export interface FakeNode {
  kind: string;
  connections: FakeNode[];
  disconnected: boolean;
  started: number | null;
  stopped: number | null;
  connect(target: FakeNode): FakeNode;
  disconnect(): void;
  [key: string]: unknown;
}

function param(value = 0) {
  return {
    value,
    events: [] as [string, number, number][],
    setValueAtTime(v: number, t: number) {
      this.events.push(['set', v, t]);
      return this;
    },
    linearRampToValueAtTime(v: number, t: number) {
      this.events.push(['linear', v, t]);
      return this;
    },
    exponentialRampToValueAtTime(v: number, t: number) {
      if (v <= 0) throw new RangeError('exponential ramp to a non-positive value');
      this.events.push(['exp', v, t]);
      return this;
    },
    setTargetAtTime(v: number, t: number) {
      this.events.push(['target', v, t]);
      return this;
    },
    cancelScheduledValues() {
      return this;
    },
  };
}

export function fakeAudioContext(currentTime = 0) {
  const nodes: FakeNode[] = [];
  const node = (kind: string, extra: Record<string, unknown> = {}): FakeNode => {
    const n: FakeNode = {
      kind,
      connections: [],
      disconnected: false,
      started: null,
      stopped: null,
      connect(target) {
        this.connections.push(target);
        return target;
      },
      disconnect() {
        this.disconnected = true;
      },
      start(t = 0) {
        this.started = t as number;
      },
      stop(t = 0) {
        this.stopped = t as number;
      },
      ...extra,
    };
    nodes.push(n);
    return n;
  };
  const ctx = {
    currentTime,
    sampleRate: 48_000,
    state: 'suspended' as AudioContextState,
    destination: node('destination'),
    nodes,
    resume() {
      ctx.state = 'running';
      return Promise.resolve();
    },
    close() {
      ctx.state = 'closed';
      return Promise.resolve();
    },
    createGain: () => node('gain', { gain: param(1) }),
    createOscillator: () => node('osc', { type: 'sine', frequency: param(440), detune: param(0) }),
    createBiquadFilter: () =>
      node('filter', { type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }),
    createBufferSource: () => node('buffer', { buffer: null, loop: false, playbackRate: param(1) }),
    createBuffer: (channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createDynamicsCompressor: () => node('compressor', { threshold: param(-24), ratio: param(12) }),
  };
  return ctx;
}
export type FakeAudioContext = ReturnType<typeof fakeAudioContext>;

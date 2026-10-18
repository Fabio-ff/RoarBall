import type { Animation, Document } from '@gltf-transform/core';

/** Spherical interpolation of two unit quaternions stored at `a` and `b` of `values`. */
function slerp(values: Float32Array, a: number, b: number, t: number, out: number[]): void {
  let [ax, ay, az, aw] = [values[a], values[a + 1], values[a + 2], values[a + 3]];
  const [bx, by, bz, bw] = [values[b], values[b + 1], values[b + 2], values[b + 3]];
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    dot = -dot;
    ax = -ax;
    ay = -ay;
    az = -az;
    aw = -aw;
  }
  let ka = 1 - t;
  let kb = t;
  if (dot < 0.9995) {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    ka = Math.sin((1 - t) * theta) / sin;
    kb = Math.sin(t * theta) / sin;
  }
  const q = [ka * ax + kb * bx, ka * ay + kb * by, ka * az + kb * bz, ka * aw + kb * bw];
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  for (const c of q) out.push(c / length);
}

/** The value of a track at `time`: linear (slerp for rotations), or the previous key for STEP. */
function sampleAt(
  times: Float32Array,
  values: Float32Array,
  itemSize: number,
  rotation: boolean,
  step: boolean,
  time: number,
  out: number[],
): void {
  const last = times.length - 1;
  if (time <= times[0]) return void out.push(...values.slice(0, itemSize));
  if (time >= times[last])
    return void out.push(...values.slice(last * itemSize, (last + 1) * itemSize));
  let i = 0;
  while (times[i + 1] < time) i++;
  const a = i * itemSize;
  if (step) return void out.push(...values.slice(a, a + itemSize));
  const t = (time - times[i]) / (times[i + 1] - times[i]);
  const b = (i + 1) * itemSize;
  if (rotation) return slerp(values, a, b, t, out);
  for (let k = 0; k < itemSize; k++) out.push(values[a + k] + (values[b + k] - values[a + k]) * t);
}

/**
 * Copies the window [start, end] seconds of `clip` into a new clip called `name`, keys
 * shifted so the window starts at 0. The edges are interpolated, so the new clip lasts exactly
 * end - start (end is clamped to the source length). Throws on cubic-spline tracks and on an
 * empty window.
 */
export function subclip(
  doc: Document,
  clip: Animation,
  name: string,
  start: number,
  end: number,
): Animation {
  const source = clip.getName();
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const out = doc.createAnimation(name);
  let duration = 0;
  for (const channel of clip.listChannels()) {
    const sampler = channel.getSampler();
    const input = sampler?.getInput();
    const times = input?.getArray();
    if (times && times.length > 0) duration = Math.max(duration, times[times.length - 1]);
  }
  const to = Math.min(end, duration);
  if (!(to > start)) throw new Error(`clip "${source}": empty window [${start}, ${end}]`);

  for (const channel of clip.listChannels()) {
    const sampler = channel.getSampler();
    const input = sampler?.getInput();
    const output = sampler?.getOutput();
    if (!sampler || !input || !output) continue;
    if (sampler.getInterpolation() === 'CUBICSPLINE') {
      throw new Error(`clip "${source}": CUBICSPLINE is not supported`);
    }
    const times = input.getArray() as Float32Array;
    const values = output.getArray() as Float32Array;
    const itemSize = values.length / times.length;
    const path = channel.getTargetPath();
    if (!path) continue;
    const rotation = path === 'rotation';
    const step = sampler.getInterpolation() === 'STEP';

    const newTimes: number[] = [0];
    const newValues: number[] = [];
    sampleAt(times, values, itemSize, rotation, step, start, newValues);
    for (let i = 0; i < times.length; i++) {
      if (times[i] <= start || times[i] >= to) continue;
      newTimes.push(times[i] - start);
      newValues.push(...values.slice(i * itemSize, (i + 1) * itemSize));
    }
    newTimes.push(to - start);
    sampleAt(times, values, itemSize, rotation, step, to, newValues);

    const newInput = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Float32Array(newTimes))
      .setBuffer(buffer);
    const newOutput = doc
      .createAccessor()
      .setType(output.getType())
      .setArray(new Float32Array(newValues))
      .setBuffer(buffer);
    const newSampler = doc
      .createAnimationSampler()
      .setInput(newInput)
      .setOutput(newOutput)
      .setInterpolation(sampler.getInterpolation());
    out.addSampler(newSampler);
    out.addChannel(
      doc
        .createAnimationChannel()
        .setSampler(newSampler)
        .setTargetNode(channel.getTargetNode())
        .setTargetPath(path),
    );
  }
  return out;
}

/** Disposes the given clips (the raw source clips once the canonical ones are cut). */
export function dropClips(clips: readonly Animation[]): void {
  for (const clip of clips) {
    // Channels and samplers are separate properties: dispose them too, or their keyframe
    // accessors stay referenced and are written into the file.
    for (const channel of clip.listChannels()) channel.dispose();
    for (const sampler of clip.listSamplers()) sampler.dispose();
    clip.dispose();
  }
}

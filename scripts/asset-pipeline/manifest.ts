import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { DEFAULT_HIPS } from './hips.ts';

/** Same list as `CANONICAL_CLIPS` in src/render/clip-for.ts (scripts never import src; a test keeps them equal). */
export const CANONICAL_CLIPS = ['idle', 'run', 'dribble', 'jump', 'shoot', 'hit', 'fall'] as const;
export type CanonicalClipName = (typeof CANONICAL_CLIPS)[number];
/** Looping is decided by the canonical name at runtime (clip-for.ts), so the manifest must agree. */
export const LOOPING: ReadonlySet<string> = new Set(['idle', 'run', 'dribble']);

export interface ClipSpec {
  /** Name of the clip in the raw export. */
  source: string;
  start: number;
  end: number;
  loop: boolean;
  /** Metres (source-model units) added to the hips Y of this clip so the body stays above the floor. */
  floorOffset: number;
}

export interface Manifest {
  /** The file name without `.json`; also the name of the output GLB. */
  id: string;
  /** File name inside sources/raw/. */
  source: string;
  height: number;
  releaseAt: number;
  hipsNode: string;
  materials: { metalness: number; roughness: number; flatten: boolean };
  clips: Record<CanonicalClipName, ClipSpec>;
}

function fail(id: string, message: string): never {
  throw new Error(`manifest ${id}: ${message}`);
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates parsed JSON and fills the defaults (hips name, floorOffset 0, flatten false). */
export function parseManifest(raw: unknown, id: string): Manifest {
  if (!isRecord(raw)) return fail(id, 'must be an object');
  if (typeof raw.source !== 'string' || raw.source === '') fail(id, '"source" must be a file name');
  if (!isNumber(raw.height) || raw.height <= 0) fail(id, '"height" must be a positive number');
  if (!isNumber(raw.releaseAt) || raw.releaseAt <= 0) fail(id, '"releaseAt" must be > 0');
  const hipsNode = raw.hipsNode === undefined ? DEFAULT_HIPS : raw.hipsNode;
  if (typeof hipsNode !== 'string') return fail(id, '"hipsNode" must be a string');
  const m = raw.materials;
  if (!isRecord(m) || !isNumber(m.metalness) || !isNumber(m.roughness)) {
    return fail(id, '"materials" needs numeric "metalness" and "roughness"');
  }
  if (!isRecord(raw.clips)) return fail(id, '"clips" must be an object');
  const clips = {} as Record<CanonicalClipName, ClipSpec>;
  for (const name of CANONICAL_CLIPS) {
    const c = raw.clips[name];
    if (!isRecord(c)) return fail(id, `missing clip "${name}"`);
    if (typeof c.source !== 'string') fail(id, `clip "${name}": "source" must be a string`);
    if (!isNumber(c.start) || !isNumber(c.end) || c.start < 0 || c.end <= c.start) {
      fail(id, `clip "${name}": need 0 <= start < end`);
    }
    if (typeof c.loop !== 'boolean') fail(id, `clip "${name}": "loop" must be a boolean`);
    if (c.loop !== LOOPING.has(name)) fail(id, `clip "${name}": loop must be ${LOOPING.has(name)}`);
    const floorOffset = c.floorOffset === undefined ? 0 : c.floorOffset;
    if (!isNumber(floorOffset)) fail(id, `clip "${name}": "floorOffset" must be a number`);
    clips[name] = { source: c.source, start: c.start, end: c.end, loop: c.loop, floorOffset };
  }
  const shoot = clips.shoot;
  if (raw.releaseAt >= shoot.end - shoot.start)
    fail(id, '"releaseAt" must fall inside the shoot clip');
  return {
    id,
    source: raw.source,
    height: raw.height,
    releaseAt: raw.releaseAt,
    hipsNode,
    materials: { metalness: m.metalness, roughness: m.roughness, flatten: m.flatten === true },
    clips,
  };
}

export function loadManifest(path: string): Manifest {
  return parseManifest(JSON.parse(readFileSync(path, 'utf8')), basename(path, '.json'));
}

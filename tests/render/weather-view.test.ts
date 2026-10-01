import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { getCourt } from '../../src/content/courts';
import { EMBER_COUNT, RAIN_COUNT, rainVelocity, WeatherView } from '../../src/render/weather-view';

const half = (): number => 0.5;

function instance(view: WeatherView, i: number): { pos: Vector3; rot: Quaternion } {
  const m = new Matrix4();
  view.instances?.getMatrixAt(i, m);
  const pos = new Vector3();
  const rot = new Quaternion();
  m.decompose(pos, rot, new Vector3());
  return { pos, rot };
}

describe('rainVelocity', () => {
  it('falls straight without wind and slants along the gust', () => {
    expect(rainVelocity(null)).toEqual({ x: 0, y: -14, z: 0 });
    const v = rainVelocity({ x: 1, y: 0, z: 0 });
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBe(-14);
  });
});

describe('WeatherView (spec D.6)', () => {
  it('is empty on courts without weather', () => {
    const view = new WeatherView(getCourt('gym'), half);
    expect(view.group.children).toHaveLength(0);
    expect(view.instances).toBeNull();
    view.update(0.1); // no-op
  });

  it('rain streaks are vertical in calm weather and slant with a gust', () => {
    const view = new WeatherView(getCourt('rooftop'), half);
    expect(view.instances?.count).toBe(RAIN_COUNT);
    view.update(0.016);
    expect(Math.abs(instance(view, 0).rot.z)).toBeLessThan(1e-9);
    view.handleEvents([{ type: 'gustStart', dir: { x: 1, y: 0, z: 0 } }]);
    view.update(0.016);
    expect(view.tilt).toBeGreaterThan(0.3);
    expect(Math.abs(instance(view, 0).rot.z)).toBeGreaterThan(0.1);
    view.handleEvents([{ type: 'gustEnd' }]);
    expect(view.tilt).toBe(0);
  });

  it('embers rise', () => {
    const view = new WeatherView(getCourt('volcano'), half);
    expect(view.instances?.count).toBe(EMBER_COUNT);
    const before = instance(view, 0).pos.y;
    view.update(0.1);
    expect(instance(view, 0).pos.y).toBeGreaterThan(before);
  });

  it('reset forgets the gust (a new match starts calm)', () => {
    const view = new WeatherView(getCourt('rooftop'), half);
    view.handleEvents([{ type: 'gustStart', dir: { x: 0, y: 0, z: 1 } }]);
    view.reset();
    expect(view.tilt).toBe(0);
  });
});

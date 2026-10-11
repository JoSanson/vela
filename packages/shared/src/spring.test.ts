import { describe, expect, it } from 'vitest';
import { Spring, SPRING_CRISP, SPRING_GESTURE } from './spring';

function run(params: { response: number; dampingRatio: number }, from: number, to: number) {
  const s = new Spring(from, params);
  s.target = to;
  const samples: number[] = [];
  let t = 0;
  while (!s.settled(Math.abs(to - from)) && t < 5) {
    s.step(1 / 120);
    t += 1 / 120;
    samples.push(s.value);
  }
  return { s, samples, t };
}

describe('Spring', () => {
  it('reaches its target monotonically with the crisp parameters, in about its response time', () => {
    const { samples, t } = run(SPRING_CRISP, 0, 260);
    expect(samples.every((v, i) => i === 0 || v >= (samples[i - 1] ?? 0) - 1e-6)).toBe(true);
    expect(Math.max(...samples)).toBeLessThanOrEqual(260 + 0.26);
    expect(t).toBeGreaterThan(0.2);
    expect(t).toBeLessThan(0.6);
  });

  it('overshoots only a hair with the gesture parameters and settles later', () => {
    const { samples, t } = run(SPRING_GESTURE, 260, 0);
    expect(Math.min(...samples)).toBeGreaterThan(-1);
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(1.2);
  });

  it('retargets mid-flight keeping its velocity, and snaps instantly', () => {
    const s = new Spring(0, SPRING_CRISP);
    s.target = 1;
    for (let i = 0; i < 6; i++) s.step(1 / 60);
    const v = s.velocity;
    s.target = 0;
    s.step(1 / 60);
    expect(v).toBeGreaterThan(0);
    expect(s.velocity).toBeLessThan(v);
    s.snap(0.5);
    expect(s.value).toBe(0.5);
    expect(s.velocity).toBe(0);
    expect(s.settled()).toBe(true);
  });

  it('stays stable with a large frame delta', () => {
    const s = new Spring(0, SPRING_CRISP);
    s.target = 100;
    s.step(0.5);
    expect(s.value).toBeGreaterThan(99);
    expect(s.value).toBeLessThan(101);
  });
});

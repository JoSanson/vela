/**
 * Damped spring in the SwiftUI/Motion parametrisation, which is what Arc animates its sidebar with
 * (D033): `response` is the period of the undamped spring in seconds, `dampingRatio` 1 is critical
 * damping (no overshoot), below 1 overshoots a little. Pure maths, no timers: the renderer feeds
 * frame deltas and reads `value`.
 */
export interface SpringParams {
  response: number;
  dampingRatio: number;
}

/** Arc: programmatic sidebar transitions (crisp, no visible overshoot). */
export const SPRING_CRISP: SpringParams = { response: 0.3, dampingRatio: 0.99 };
/** Arc: gesture-driven transitions (a touch of rebound). */
export const SPRING_GESTURE: SpringParams = { response: 0.55, dampingRatio: 0.94 };

/** Below this distance and speed (in units of the full travel) the spring is considered at rest. */
export const SPRING_EPSILON = 0.001;

const MAX_STEP = 1 / 60;

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private readonly stiffness: number;
  private readonly damping: number;

  constructor(initial: number, params: SpringParams) {
    this.value = initial;
    this.target = initial;
    const omega = (2 * Math.PI) / Math.max(0.01, params.response);
    this.stiffness = omega * omega;
    this.damping = 2 * params.dampingRatio * omega;
  }

  /**
   * Advances the simulation by `dt` seconds (sub-stepped at 60 Hz for stability). A stalled frame
   * catches up with real time, so the motion never lags behind the clock; deltas beyond 1 s (the
   * window was hidden) are capped to bound the work.
   */
  step(dt: number): number {
    let remaining = Math.min(dt, 1);
    while (remaining > 0) {
      const h = Math.min(MAX_STEP, remaining);
      const accel = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    return this.value;
  }

  /** At rest when both distance to target and speed are negligible relative to `scale`. */
  settled(scale = 1): boolean {
    const s = Math.max(Math.abs(scale), 1e-9);
    return (
      Math.abs(this.value - this.target) / s < SPRING_EPSILON &&
      Math.abs(this.velocity) / s < SPRING_EPSILON * 10
    );
  }

  snap(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }
}

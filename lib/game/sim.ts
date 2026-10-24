// Roadster flight simulation. Framework-free so it can be tested headless
// and reused by any renderer.
// Units: metres, seconds, radians. y is up. Angle > 0 tilts the nose up.

export const G = 9.81;
export const TACC = 0.78 * G; // lift from one thruster, as acceleration
export const SPIN = 1.9; // angular accel from one thruster alone (rad/s²)
export const SPIN_DAMP = 1.6; // angular damping (1/s)
export const BURN = 1.8; // % of tank per second per thruster
export const WHEEL_Y = -0.63; // wheel contact below centre of mass
export const DT = 1 / 120;

export type Vec = [number, number];

// Touchdown limits. Normal is forgiving (the wheels and suspension soak up a
// bump); Challenge keeps the original prototype's strict limits.
export type Difficulty = "normal" | "challenge";
export interface Limits { vs: number; hs: number; tilt: number; slope: number }
export const LIMITS: Record<Difficulty, Limits> = {
  normal: { vs: 5.5, hs: 3.5, tilt: 18, slope: 18 },
  challenge: { vs: 3.0, hs: 2.0, tilt: 10, slope: 12 },
};

// Contact points in car space. Wheels may touch; the body may not.
export const WHEELS: Vec[] = [[1.35, WHEEL_Y], [-1.35, WHEEL_Y]];
export const HULL: Vec[] = [[2.24, -0.3], [2.3, -0.05], [-2.2, -0.3], [-2.25, 0.05], [1.0, 0.26], [-0.2, 0.64], [-0.8, 0.6], [-1.9, 0.3]];
export const NOZZLES: Vec[] = [[-1.9, -0.36], [1.9, -0.36]]; // left (rear), right (front)

export interface Level {
  name: string;
  brief: string;
  terrain: Vec[];
  start: Vec;
  target: Vec;
  gas: number;
}

export const LEVELS: Level[] = [
  {
    name: "Pad Hop",
    brief: "Lift off, cross about 60 m of desert and set down on the green pad.",
    terrain: [[-70, 3], [-20, 0], [30, 0], [44, 1.6], [52, 0], [72, 0], [100, 3], [150, 9], [170, 30]],
    start: [-5, 5],
    target: [55, 67],
    gas: 100,
  },
  {
    name: "Ridge Run",
    brief: "Climb over the ridge and land on the raised pad behind it.",
    terrain: [[-70, 5], [-15, 0], [8, 0], [20, 6], [33, 21], [44, 24], [55, 9], [68, 10], [78, 14], [92, 14], [96, 9], [130, 5], [170, 18], [190, 40]],
    start: [-5, 5],
    target: [80, 92],
    gas: 100,
  },
  {
    name: "Mesa Top",
    brief: "Hop onto a 38 m mesa. The pad is short and the tank is the same size.",
    terrain: [[-70, 2], [10, 0], [32, 3], [62, 5], [96, 6], [100, 38], [117, 38], [121, 6], [160, 4], [200, 12], [220, 40]],
    start: [-5, 5],
    target: [103, 113],
    gas: 100,
  },
];

export type Mode = "fly" | "landed" | "crash";
export type SimEvent = "liftoff" | "touchdown" | "landed" | "crash";

export interface Touchdown { vs: number; hs: number; tilt: number; offset: number; score: number }

export interface Result {
  reason: string | null;
  td: Touchdown | null;
  time: number;
  gas: number;
}

export interface Sim {
  level: number;
  lv: Level;
  difficulty: Difficulty;
  limits: Limits;
  x: number; y: number; vx: number; vy: number; a: number; w: number;
  gas: number;
  t: number;
  grounded: boolean;
  mode: Mode;
  L: boolean; R: boolean;
  result: Result | null;
  events: SimEvent[];
}

export interface Input { L: boolean; R: boolean }

export function groundY(lv: Level, x: number): number {
  const t = lv.terrain;
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1], [x1, y1] = t[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return t[t.length - 1][1];
}

export function slopeAt(lv: Level, x: number): number {
  return Math.atan2(groundY(lv, x + 0.25) - groundY(lv, x - 0.25), 0.5);
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function toWorld(s: Sim, p: Vec): Vec {
  const c = Math.cos(s.a), n = Math.sin(s.a);
  return [s.x + p[0] * c - p[1] * n, s.y + p[0] * n + p[1] * c];
}

export function newSim(levelIndex: number, difficulty: Difficulty = "normal"): Sim {
  const lv = LEVELS[levelIndex];
  const x = (lv.start[0] + lv.start[1]) / 2;
  return {
    level: levelIndex, lv, difficulty, limits: LIMITS[difficulty], x, y: groundY(lv, x) - WHEEL_Y, vx: 0, vy: 0, a: 0, w: 0,
    gas: lv.gas, t: 0, grounded: true, mode: "fly", L: false, R: false,
    result: null, events: [],
  };
}

export function simStep(s: Sim, input: Input, dt: number): void {
  if (s.mode !== "fly") return;
  s.t += dt;
  const hasGas = s.gas > 0;
  s.L = input.L && hasGas;
  s.R = input.R && hasGas;
  const n = (s.L ? 1 : 0) + (s.R ? 1 : 0);
  if (n) s.gas = Math.max(0, s.gas - n * BURN * dt);

  if (s.grounded) {
    // One thruster can't lift the car; both together can.
    if (n === 2) {
      s.grounded = false;
      s.y += 0.02;
      s.events.push("liftoff");
    } else {
      if (!hasGas && !onTarget(s)) finish(s, "crash", "Out of cold gas short of the pad.");
      return;
    }
  }

  const sn = Math.sin(s.a), cs = Math.cos(s.a);
  s.vx += -sn * n * TACC * dt;
  s.vy += (cs * n * TACC - G) * dt;
  s.vx *= 1 - 0.03 * dt;
  s.w += ((s.R ? 1 : 0) - (s.L ? 1 : 0)) * SPIN * dt;
  s.w *= Math.max(0, 1 - SPIN_DAMP * dt);
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.a = wrapAngle(s.a + s.w * dt);

  const lv = s.lv, t = lv.terrain;
  if (s.x < t[0][0] + 3 || s.x > t[t.length - 1][0] - 3 || s.y > 160) {
    return finish(s, "crash", "Left the test range.");
  }
  const below = (p: Vec) => { const [wx, wy] = toWorld(s, p); return wy < groundY(lv, wx); };
  const touching = WHEELS.some(below);
  // The wheels get the first say: a tilted touchdown within limits settles even
  // if a bumper corner dips into the ground on the same step.
  if (!touching) {
    if (HULL.some(below)) finish(s, "crash", "The body hit the ground before the wheels did.");
    return;
  }

  const lim = s.limits;
  const slope = slopeAt(lv, s.x);
  const td = touchdown(s, slope);
  if (td.vs > lim.vs) return finish(s, "crash", `Hit the ground at ${td.vs.toFixed(1)} m/s. Keep it under ${lim.vs} m/s.`, td);
  if (td.hs > lim.hs) return finish(s, "crash", `Touched down drifting ${td.hs.toFixed(1)} m/s sideways. Keep it under ${lim.hs} m/s.`, td);
  if (td.tilt > lim.tilt) return finish(s, "crash", `Touched down tilted ${td.tilt.toFixed(0)}°. Keep it under ${lim.tilt}°.`, td);
  if (Math.abs(slope) * 180 / Math.PI > lim.slope) return finish(s, "crash", "The ground there is too steep to park on.", td);

  // Safe touchdown: settle onto the surface.
  s.a = slope;
  s.w = 0;
  s.vx = 0;
  s.vy = 0;
  s.y = groundY(lv, s.x) - WHEEL_Y / Math.cos(slope);
  s.grounded = true;
  s.events.push("touchdown");
  if (onTarget(s)) finish(s, "landed", null, td);
}

function touchdown(s: Sim, slope: number): Touchdown {
  const [x1, x2] = s.lv.target;
  const half = (x2 - x1) / 2;
  const offset = Math.abs(s.x - (x1 + x2) / 2);
  const td = { vs: -s.vy, hs: Math.abs(s.vx), tilt: Math.abs(wrapAngle(s.a - slope)) * 180 / Math.PI, offset, score: 0 };
  td.score = landingScore(td, s.limits, half);
  return td;
}

// 0–10, judged against the current mode's limits: vertical speed matters most,
// then drift and tilt, then how close to the pad centre the car stopped.
export function landingScore(td: Omit<Touchdown, "score">, lim: Limits, padHalf: number): number {
  const part = (v: number, max: number) => Math.min(1, Math.max(0, v / max));
  const loss = 0.45 * part(td.vs, lim.vs) + 0.2 * part(td.hs, lim.hs) + 0.2 * part(td.tilt, lim.tilt) + 0.15 * part(td.offset, padHalf);
  return Math.max(1, Math.round(100 * (1 - loss)) / 10);
}

export function onTarget(s: Sim): boolean {
  const [x1, x2] = s.lv.target;
  return WHEELS.every(p => {
    const wx = toWorld(s, p)[0];
    return wx >= x1 && wx <= x2;
  }) && Math.abs(s.y + WHEEL_Y - groundY(s.lv, s.x)) < 0.2;
}

function finish(s: Sim, mode: Mode, reason: string | null, td?: Touchdown): void {
  s.mode = mode;
  s.L = s.R = false;
  s.result = { reason, td: td ?? null, time: s.t, gas: s.gas };
  s.events.push(mode === "landed" ? "landed" : "crash");
}

export function rating(td: Touchdown): string {
  if (td.score >= 9) return "Feather landing";
  if (td.score >= 7) return "Smooth landing";
  if (td.score >= 5) return "Solid landing";
  return "Rough landing";
}

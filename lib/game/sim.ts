// Roadster flight simulation. Framework-free so it can be tested headless
// and reused by any renderer.
// Units: metres, seconds, radians. y is up. Angle > 0 tilts the nose up.

export const G = 9.81;
export const WHEEL_Y = -0.63; // wheel contact below centre of mass
export const DT = 1 / 120;

export type Vec = [number, number];

// How the car handles and how strict touchdown is, per difficulty.
// Easy is floaty and levels itself; Normal levels itself gently and forgives
// a bump; Challenge is the original prototype: Earth gravity, no help.
export type Difficulty = "easy" | "normal" | "challenge";
export interface Limits { vs: number; hs: number; tilt: number; slope: number }
export interface Profile {
  gravity: number; // m/s²
  thrust: number; // lift from one thruster at full throttle, in multiples of gravity
  spin: number; // angular accel from one thruster alone (rad/s²)
  spinDamp: number; // angular damping (1/s)
  selfLevel: number; // pull back towards level while not steering (1/s²); 0 = none
  burn: number; // % of tank per second per thruster at full throttle
  limits: Limits;
}
export const PROFILES: Record<Difficulty, Profile> = {
  easy: {
    gravity: 0.55 * G, thrust: 0.85, spin: 1.15, spinDamp: 2.6, selfLevel: 3.0, burn: 1.0,
    limits: { vs: 7.0, hs: 5.0, tilt: 25, slope: 22 },
  },
  normal: {
    gravity: G, thrust: 0.78, spin: 1.9, spinDamp: 1.8, selfLevel: 0.8, burn: 1.8,
    limits: { vs: 5.5, hs: 3.5, tilt: 18, slope: 18 },
  },
  challenge: {
    gravity: G, thrust: 0.78, spin: 1.9, spinDamp: 1.6, selfLevel: 0, burn: 1.8,
    limits: { vs: 3.0, hs: 2.0, tilt: 10, slope: 12 },
  },
};
export const LIMITS: Record<Difficulty, Limits> = {
  easy: PROFILES.easy.limits,
  normal: PROFILES.normal.limits,
  challenge: PROFILES.challenge.limits,
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
  profile: Profile;
  limits: Limits;
  x: number; y: number; vx: number; vy: number; a: number; w: number;
  gas: number;
  t: number;
  grounded: boolean;
  mode: Mode;
  L: number; R: number; // thruster throttles, 0–1, as last applied
  result: Result | null;
  events: SimEvent[];
}

// Thruster throttles, 0–1. Pro controls send 0 or 1; Simple controls send
// anything in between.
export interface Input { L: number; R: number }

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
    level: levelIndex, lv, difficulty, profile: PROFILES[difficulty], limits: LIMITS[difficulty], x, y: groundY(lv, x) - WHEEL_Y, vx: 0, vy: 0, a: 0, w: 0,
    gas: lv.gas, t: 0, grounded: true, mode: "fly", L: 0, R: 0,
    result: null, events: [],
  };
}

export function simStep(s: Sim, input: Input, dt: number): void {
  if (s.mode !== "fly") return;
  s.t += dt;
  const pf = s.profile;
  const hasGas = s.gas > 0;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v || 0));
  s.L = hasGas ? clamp01(input.L) : 0;
  s.R = hasGas ? clamp01(input.R) : 0;
  const n = s.L + s.R;
  if (n) s.gas = Math.max(0, s.gas - n * pf.burn * dt);
  const g = pf.gravity, tacc = pf.thrust * g;

  if (s.grounded) {
    // One thruster can't lift the car; both together can.
    if (n * tacc > g * 1.05) {
      s.grounded = false;
      s.y += 0.02;
      s.events.push("liftoff");
    } else {
      if (!hasGas && !onTarget(s)) finish(s, "crash", "Out of cold gas short of the pad.");
      return;
    }
  }

  const sn = Math.sin(s.a), cs = Math.cos(s.a);
  s.vx += -sn * n * tacc * dt;
  s.vy += (cs * n * tacc - g) * dt;
  s.vx *= 1 - 0.03 * dt;
  const steer = s.R - s.L;
  s.w += steer * pf.spin * dt;
  if (Math.abs(steer) < 0.05) s.w -= pf.selfLevel * s.a * dt;
  s.w *= Math.max(0, 1 - pf.spinDamp * dt);
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
  s.L = s.R = 0;
  s.result = { reason, td: td ?? null, time: s.t, gas: s.gas };
  s.events.push(mode === "landed" ? "landed" : "crash");
}

export function rating(td: Touchdown): string {
  if (td.score >= 9) return "Feather landing";
  if (td.score >= 7) return "Smooth landing";
  if (td.score >= 5) return "Solid landing";
  return "Rough landing";
}

// Simple controls: the player says where to go, and this works out the two
// thruster throttles. Holding Lift climbs; letting go sinks gently, slow
// enough to touch down safely in every mode. With no tilt held, it leans
// against any sideways drift so the car comes to a stop. Holding an arrow
// cruises that way at a steady speed rather than accelerating forever.
export interface SimpleCommand { lift: boolean; left: boolean; right: boolean }

export const SIMPLE = { climb: 3.5, sink: -1.6, cruise: 6, lean: 0.35 };

export function simplePilot(s: Sim, cmd: SimpleCommand): Input {
  if (s.mode !== "fly" || (s.grounded && !cmd.lift)) return { L: 0, R: 0 };
  const pf = s.profile, tacc = pf.thrust * pf.gravity;
  const vxDes = cmd.left === cmd.right ? 0 : cmd.right ? SIMPLE.cruise : -SIMPLE.cruise;
  // Nose up (a > 0) pushes left, so lean against the speed we're missing.
  const aDes = Math.max(-SIMPLE.lean, Math.min(SIMPLE.lean, -0.12 * (vxDes - s.vx)));
  const vyDes = cmd.lift ? SIMPLE.climb : SIMPLE.sink;
  const total = (pf.gravity + 2.5 * (vyDes - s.vy)) / (tacc * Math.max(0.5, Math.cos(s.a)));
  const diff = Math.max(-1, Math.min(1, (7 * (aDes - s.a) - 3.2 * s.w) / pf.spin));
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return { L: clamp01((total - diff) / 2), R: clamp01((total + diff) / 2) };
}

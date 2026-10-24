// Flies every level with a simple autopilot to prove each one is landable on the tank
// it gets, and checks the touchdown rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DT, LEVELS, LIMITS, groundY, newSim, simStep, simplePilot, type Difficulty, type Sim } from "../lib/game/sim.ts";

const MODES: Difficulty[] = ["easy", "normal", "challenge"];

function fly(s: Sim) {
  const lv = s.lv;
  const tx = (lv.target[0] + lv.target[1]) / 2, padY = groundY(lv, tx);
  let maxG = -Infinity;
  for (let x = s.x; x <= tx; x += 0.5) maxG = Math.max(maxG, groundY(lv, x));
  const cruise = maxG + 7;
  const pf = s.profile, tacc = pf.thrust * pf.gravity;
  let accL = 0, accR = 0, steps = 0;
  while (s.mode === "fly" && steps < 120 * 90) {
    const dx = tx - s.x;
    const near = Math.abs(dx) < 1.5 && Math.abs(s.vx) < 0.6;
    const hDes = near ? padY - 2 : Math.abs(dx) < 12 ? Math.max(padY + 3, cruise - (12 - Math.abs(dx))) : cruise;
    const vxDes = Math.max(-5, Math.min(5, 0.35 * dx));
    const aDes = -Math.max(-0.3, Math.min(0.3, 0.12 * (vxDes - s.vx)));
    const vyDes = near ? -1.0 : Math.max(-2.5, Math.min(4, 0.9 * (hDes - s.y + 0.63)));
    const u = (pf.gravity + 2.0 * (vyDes - s.vy)) / (tacc * Math.cos(s.a));
    const d = Math.max(-1, Math.min(1, (8 * (aDes - s.a) - 3.5 * s.w) / pf.spin));
    let r = Math.max(0, Math.min(1, (u + d) / 2)), l = Math.max(0, Math.min(1, (u - d) / 2));
    if (s.grounded && steps < 10) l = r = 1;
    accL += l; accR += r;
    const L = accL >= 1, R = accR >= 1;
    if (L) accL -= 1;
    if (R) accR -= 1;
    // Pro controls: each thruster fully on or off.
    simStep(s, { L: L ? 1 : 0, R: R ? 1 : 0 }, DT);
    steps++;
  }
}

for (const mode of MODES) {
  for (let i = 0; i < LEVELS.length; i++) {
    test(`pro-controls autopilot lands ${LEVELS[i].name} in ${mode} mode with gas to spare`, () => {
      const s = newSim(i, mode);
      fly(s);
      assert.equal(s.mode, "landed", s.result?.reason ?? "did not finish");
      assert.ok(s.gas > 20, `only ${s.gas.toFixed(1)}% gas left`);
      const score = s.result!.td!.score;
      assert.ok(score >= 7 && score <= 10, `score ${score}`);
    });
  }
}

// A player on Simple controls: hold Lift to clear the terrain, hold the arrow
// towards the pad, then let go over it and let the car sink and brake itself.
function flySimple(s: Sim) {
  const lv = s.lv;
  const tx = (lv.target[0] + lv.target[1]) / 2;
  let maxG = -Infinity;
  for (let x = s.x; x <= tx; x += 0.5) maxG = Math.max(maxG, groundY(lv, x));
  for (let k = 0; k < 120 * 90 && s.mode === "fly"; k++) {
    const dx = tx - s.x;
    const ahead = groundY(lv, s.x + Math.sign(dx) * 8);
    const lift = s.y < Math.max(maxG, ahead) + 6 && Math.abs(dx) > 3;
    const brakeDist = (s.vx * s.vx) / 4 + 2;
    const go = Math.abs(dx) > brakeDist;
    simStep(s, simplePilot(s, { lift, left: go && dx < 0, right: go && dx > 0 }), DT);
  }
}

for (const mode of MODES) {
  for (let i = 0; i < LEVELS.length; i++) {
    test(`simple controls land ${LEVELS[i].name} in ${mode} mode`, () => {
      const s = newSim(i, mode);
      flySimple(s);
      assert.equal(s.mode, "landed", s.result?.reason ?? `did not finish, x=${s.x.toFixed(1)}`);
    });
  }
}

test("letting go of Simple controls sinks the car slowly enough to land in challenge mode", () => {
  const s = newSim(0, "challenge");
  s.x = 61; s.grounded = false; s.y = groundY(s.lv, s.x) + 15; s.vx = 3;
  for (let k = 0; k < 120 * 30 && s.mode === "fly"; k++) simStep(s, simplePilot(s, { lift: false, left: false, right: false }), DT);
  assert.equal(s.mode, "landed", s.result?.reason ?? "");
});

test("easy mode levels itself after a tilt", () => {
  const s = newSim(0, "easy");
  s.grounded = false; s.y += 20; s.a = 0.5;
  for (let k = 0; k < 120 * 2; k++) simStep(s, { L: 1, R: 1 }, DT);
  assert.ok(Math.abs(s.a) < 0.08, `still tilted ${s.a.toFixed(2)} rad`);
});

// Cutting the thrusters about a metre above the pad: a bump, not a wreck, in Normal.
function dropFrom(height: number, mode: "normal" | "challenge") {
  const s = newSim(0, mode);
  s.x = 61; // over the target pad
  s.grounded = false;
  s.y = groundY(s.lv, s.x) + 0.63 + height;
  for (let k = 0; k < 120 * 5 && s.mode === "fly"; k++) simStep(s, { L: 0, R: 0 }, DT);
  return s;
}

test("a one-metre drop onto the pad is a landing in normal mode", () => {
  const s = dropFrom(1, "normal");
  assert.equal(s.mode, "landed", s.result?.reason ?? "");
});

test("a one-metre drop is a crash in challenge mode", () => {
  assert.equal(dropFrom(1, "challenge").mode, "crash");
});

test("touching down tilted 15 degrees settles in normal mode", () => {
  const s = newSim(0, "normal");
  s.x = 61; s.grounded = false; s.y = groundY(s.lv, s.x) + 1.2; s.a = 15 * Math.PI / 180; s.vy = -1;
  for (let k = 0; k < 120 * 3 && s.mode === "fly"; k++) simStep(s, { L: 0, R: 0 }, DT);
  assert.equal(s.mode, "landed", s.result?.reason ?? "");
});

test("one thruster cannot lift off the pad", () => {
  const s = newSim(0);
  for (let k = 0; k < 240; k++) simStep(s, { L: 1, R: 0 }, DT);
  assert.equal(s.grounded, true);
});

test("dropping 20 m is a crash in either mode", () => {
  for (const mode of ["normal", "challenge"] as const) {
    const s = dropFrom(20, mode);
    assert.equal(s.mode, "crash");
    assert.ok(s.result!.td!.vs > LIMITS[mode].vs);
  }
});

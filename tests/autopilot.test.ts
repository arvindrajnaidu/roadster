// Flies every level with a simple autopilot to prove each one is landable on the tank
// it gets, and checks the touchdown rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DT, G, LEVELS, LIMITS, SPIN, TACC, groundY, newSim, simStep, type Sim } from "../lib/game/sim.ts";

function fly(s: Sim) {
  const lv = s.lv;
  const tx = (lv.target[0] + lv.target[1]) / 2, padY = groundY(lv, tx);
  let maxG = -Infinity;
  for (let x = s.x; x <= tx; x += 0.5) maxG = Math.max(maxG, groundY(lv, x));
  const cruise = maxG + 7;
  let accL = 0, accR = 0, steps = 0;
  while (s.mode === "fly" && steps < 120 * 90) {
    const dx = tx - s.x;
    const near = Math.abs(dx) < 1.5 && Math.abs(s.vx) < 0.6;
    const hDes = near ? padY - 2 : Math.abs(dx) < 12 ? Math.max(padY + 3, cruise - (12 - Math.abs(dx))) : cruise;
    const vxDes = Math.max(-5, Math.min(5, 0.35 * dx));
    const aDes = -Math.max(-0.3, Math.min(0.3, 0.12 * (vxDes - s.vx)));
    const vyDes = near ? -1.0 : Math.max(-2.5, Math.min(4, 0.9 * (hDes - s.y + 0.63)));
    const u = (G + 2.0 * (vyDes - s.vy)) / (TACC * Math.cos(s.a));
    const d = Math.max(-1, Math.min(1, (8 * (aDes - s.a) - 3.5 * s.w) / SPIN));
    let r = Math.max(0, Math.min(1, (u + d) / 2)), l = Math.max(0, Math.min(1, (u - d) / 2));
    if (s.grounded && steps < 10) l = r = 1;
    accL += l; accR += r;
    const L = accL >= 1, R = accR >= 1;
    if (L) accL -= 1;
    if (R) accR -= 1;
    simStep(s, { L, R }, DT);
    steps++;
  }
}

for (const mode of ["normal", "challenge"] as const) {
  for (let i = 0; i < LEVELS.length; i++) {
    test(`autopilot lands ${LEVELS[i].name} in ${mode} mode with gas to spare`, () => {
      const s = newSim(i, mode);
      fly(s);
      assert.equal(s.mode, "landed", s.result?.reason ?? "did not finish");
      assert.ok(s.gas > 20, `only ${s.gas.toFixed(1)}% gas left`);
      const score = s.result!.td!.score;
      assert.ok(score >= 7 && score <= 10, `score ${score}`);
    });
  }
}

// Cutting the thrusters about a metre above the pad: a bump, not a wreck, in Normal.
function dropFrom(height: number, mode: "normal" | "challenge") {
  const s = newSim(0, mode);
  s.x = 61; // over the target pad
  s.grounded = false;
  s.y = groundY(s.lv, s.x) + 0.63 + height;
  for (let k = 0; k < 120 * 5 && s.mode === "fly"; k++) simStep(s, { L: false, R: false }, DT);
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
  for (let k = 0; k < 120 * 3 && s.mode === "fly"; k++) simStep(s, { L: false, R: false }, DT);
  assert.equal(s.mode, "landed", s.result?.reason ?? "");
});

test("one thruster cannot lift off the pad", () => {
  const s = newSim(0);
  for (let k = 0; k < 240; k++) simStep(s, { L: true, R: false }, DT);
  assert.equal(s.grounded, true);
});

test("dropping 20 m is a crash in either mode", () => {
  for (const mode of ["normal", "challenge"] as const) {
    const s = dropFrom(20, mode);
    assert.equal(s.mode, "crash");
    assert.ok(s.result!.td!.vs > LIMITS[mode].vs);
  }
});

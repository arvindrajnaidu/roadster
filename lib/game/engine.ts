// Game shell: input, canvas rendering, HUD, cards and sound around the sim.
import {
  DT, G, LEVELS, LIMITS, NOZZLES, WHEELS, WHEEL_Y,
  groundY, newSim, rating, simStep, simplePilot, toWorld,
  type Difficulty, type Input, type Sim,
} from "./sim";

type ParticleKind = "gas" | "dust" | "smoke" | "spark";
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; kind: ParticleKind }
interface Best { score: number; vs: number }

const MARKUP = `
<canvas class="rg-canvas" aria-label="Game view: a roadster on a desert test range"></canvas>
<div class="rg-hud">
  <div class="rg-mission">
    <button class="rg-iconbtn rg-pause" data-ref="pauseBtn" type="button" aria-label="Pause">❚❚</button>
    <div class="rg-mission-text">
      <div class="rg-lvl" data-ref="lvlName"></div>
      <div class="rg-obj">Land on the green pad</div>
    </div>
  </div>
  <div class="rg-readouts">
    <div class="rg-ro" data-ref="roAlt"><span class="k">Alt</span><span class="v"></span></div>
    <div class="rg-ro" data-ref="roVs"><span class="k">Vert</span><span class="v"></span></div>
    <div class="rg-ro" data-ref="roHs"><span class="k">Drift</span><span class="v"></span></div>
    <div class="rg-ro" data-ref="roTilt"><span class="k">Tilt</span><span class="v"></span></div>
  </div>
  <div class="rg-hud-right">
    <div class="rg-gas">
      <span class="k">Cold gas</span>
      <div class="bar"><i data-ref="gasBar"></i></div>
      <span class="pct" data-ref="gasPct">100%</span>
    </div>
    <button class="rg-iconbtn" data-ref="soundBtn" type="button" aria-pressed="true">Sound on</button>
  </div>
</div>
<div class="rg-pads">
  <div class="rg-pad-group">
    <button class="rg-thr pro-only" data-ref="padL" type="button" aria-label="Left thruster">Left<span>thruster</span></button>
    <button class="rg-thr rg-small simple-only" data-ref="padTL" type="button" aria-label="Tilt left">◀<span>left</span></button>
    <button class="rg-thr rg-small simple-only" data-ref="padTR" type="button" aria-label="Tilt right">▶<span>right</span></button>
  </div>
  <div class="rg-pad-group">
    <button class="rg-thr pro-only" data-ref="padR" type="button" aria-label="Right thruster">Right<span>thruster</span></button>
    <button class="rg-thr simple-only" data-ref="padLift" type="button" aria-label="Lift">Lift<span>hold to climb</span></button>
  </div>
</div>
<div class="rg-overlay" data-ref="overlay"><div class="rg-card" data-ref="card"></div></div>
`;

const store = {
  get<T>(k: string): T | null {
    try { return JSON.parse(localStorage.getItem(k) ?? "null") as T | null; } catch { return null; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
  },
};

function farRidge(x: number) {
  return 7 + 3.2 * Math.sin(x * 0.021) + 2.1 * Math.sin(x * 0.057 + 1.3) + 0.9 * Math.sin(x * 0.13 + 2);
}

export function mountGame(root: HTMLElement): () => void {
  root.innerHTML = MARKUP;
  const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector(`[data-ref="${name}"]`) as T;
  const cv = root.querySelector("canvas") as HTMLCanvasElement;
  const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
  const overlay = ref("overlay"), card = ref("card");
  const roAlt = ref("roAlt"), roVs = ref("roVs"), roHs = ref("roHs"), roTilt = ref("roTilt");
  const gasBar = ref("gasBar"), gasPct = ref("gasPct"), soundBtn = ref<HTMLButtonElement>("soundBtn");
  const pauseBtn = ref<HTMLButtonElement>("pauseBtn");
  const padL = ref("padL"), padR = ref("padR");
  const padTL = ref("padTL"), padTR = ref("padTR"), padLift = ref("padLift");
  const dataFont = getComputedStyle(root).getPropertyValue("--f-data").trim() || "monospace";

  const cleanups: Array<() => void> = [];
  const on = <K extends keyof WindowEventMap>(t: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    window.addEventListener(t, fn, opts);
    cleanups.push(() => window.removeEventListener(t, fn, opts));
  };

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, DPR = 1, PPM = 20;
  const MODES: Difficulty[] = ["easy", "normal", "challenge"];
  const MODE_LABEL: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", challenge: "Challenge" };
  const storedMode = store.get<Difficulty>("roadster.difficulty");
  let difficulty: Difficulty = storedMode && MODES.includes(storedMode) ? storedMode : "easy";
  // Simple: Lift + Tilt, the game balances the thrusters. Pro: fire each thruster yourself.
  type Controls = "simple" | "pro";
  let controls: Controls = store.get<Controls>("roadster.controls") === "pro" ? "pro" : "simple";
  root.classList.toggle("simple", controls === "simple");
  let sim: Sim = newSim(0, difficulty);
  let selected = 0;
  let paused = true;
  const keys = new Set<string>();
  const padState = { L: false, R: false, TL: false, TR: false, Lift: false };
  const cam = { x: sim.x, y: sim.y, shake: 0 };
  let particles: Particle[] = [];
  let resultTimer = 0;
  let touchUi = matchMedia("(pointer: coarse)").matches;
  root.classList.toggle("touch", touchUi);
  // Best landing per mode and level, keyed "normal:0".
  const best: Record<string, Best> = store.get<Record<string, Best>>("roadster.best.v2") ?? {};
  const bestKey = (i: number) => `${difficulty}:${i}`;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = root.clientWidth || window.innerWidth;
    H = root.clientHeight || window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    PPM = Math.max(15, Math.min(34, Math.min(W, H * 1.4) / 30));
  }
  on("resize", resize);
  resize();

  const stars = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random() * 0.75, r: Math.random() * 1.3 + 0.2, tw: Math.random() * 6 }));

  // ---- input ----
  const KEY_L = ["ArrowLeft", "KeyA"], KEY_R = ["ArrowRight", "KeyD"], KEY_BOTH = ["ArrowUp", "KeyW", "Space"];
  const ALL_KEYS = [...KEY_L, ...KEY_R, ...KEY_BOTH];
  // Pro controls read the keys as thrusters; Simple controls read the same keys
  // as Lift and Tilt and let simplePilot fire the thrusters.
  function readInput(): Input {
    const up = KEY_BOTH.some(k => keys.has(k));
    const left = KEY_L.some(k => keys.has(k));
    const right = KEY_R.some(k => keys.has(k));
    if (controls === "simple") {
      return simplePilot(sim, { lift: up || padState.Lift, left: left || padState.TL, right: right || padState.TR });
    }
    return { L: up || left || padState.L ? 1 : 0, R: up || right || padState.R ? 1 : 0 };
  }
  function syncKeys() {
    padTL.classList.toggle("on", padState.TL || KEY_L.some(k => keys.has(k)));
    padTR.classList.toggle("on", padState.TR || KEY_R.some(k => keys.has(k)));
    padLift.classList.toggle("on", padState.Lift || KEY_BOTH.some(k => keys.has(k)));
  }
  on("keydown", e => {
    if (ALL_KEYS.includes(e.code)) { e.preventDefault(); keys.add(e.code); syncKeys(); }
    if (e.code === "KeyR" && !e.repeat) startLevel(sim.level);
    if (e.code === "KeyM" && !e.repeat) toggleSound();
    if ((e.code === "Escape" || e.code === "KeyP") && !e.repeat) {
      if (!paused) showPause();
      else if (card.querySelector('[data-act="resume"]')) resume();
    }
    if ((e.code === "Enter" || e.code === "NumpadEnter") && paused) {
      const b = card.querySelector<HTMLButtonElement>(".primary");
      if (b) { e.preventDefault(); b.click(); }
    }
  });
  on("keyup", e => { keys.delete(e.code); syncKeys(); });
  // Going to the home screen or another tab mid-flight pauses the test.
  const onVisibility = () => { if (document.hidden) showPause(); };
  document.addEventListener("visibilitychange", onVisibility);
  cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
  on("blur", () => {
    keys.clear();
    padState.L = padState.R = padState.TL = padState.TR = padState.Lift = false;
    syncKeys();
  });
  on("touchstart", () => { touchUi = true; root.classList.add("touch"); }, { once: true, passive: true });

  function bindPad(el: HTMLElement, side: keyof typeof padState) {
    const set = (v: boolean) => { padState[side] = v; el.classList.toggle("on", v); syncKeys(); ensureAudio(); };
    el.addEventListener("pointerdown", e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      set(true);
    });
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(t, () => set(false));
    el.addEventListener("contextmenu", e => e.preventDefault());
  }
  bindPad(padL, "L");
  bindPad(padR, "R");
  bindPad(padTL, "TL");
  bindPad(padTR, "TR");
  bindPad(padLift, "Lift");

  // ---- sound: cold-gas hiss from filtered noise ----
  let audio: { ac: AudioContext; gain: GainNode; buf: AudioBuffer } | null = null;
  let soundOn = store.get<boolean>("roadster.sound") !== false;
  function paintSoundBtn() {
    soundBtn.textContent = soundOn ? "Sound on" : "Sound off";
    soundBtn.setAttribute("aria-pressed", String(soundOn));
  }
  paintSoundBtn();
  function ensureAudio() {
    if (audio || !soundOn) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1400; bp.Q.value = 0.6;
      const gain = ac.createGain(); gain.gain.value = 0;
      src.connect(bp).connect(gain).connect(ac.destination);
      src.start();
      audio = { ac, gain, buf };
    } catch { audio = null; }
  }
  function thud() {
    if (!audio || !soundOn) return;
    const { ac, buf } = audio;
    const src = ac.createBufferSource(); src.buffer = buf;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.9, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.9);
    src.connect(lp).connect(g).connect(ac.destination);
    src.start(); src.stop(ac.currentTime + 1);
  }
  function toggleSound() {
    soundOn = !soundOn;
    store.set("roadster.sound", soundOn);
    paintSoundBtn();
    if (soundOn) ensureAudio();
    if (audio) audio.gain.gain.setTargetAtTime(0, audio.ac.currentTime, 0.02);
  }
  soundBtn.addEventListener("click", toggleSound);

  // ---- cards ----
  function levelButtons() {
    return `<div class="rg-levels" role="group" aria-label="Choose a test">${LEVELS.map((lv, i) => {
      const b = best[bestKey(i)];
      return `<button class="rg-lvbtn" type="button" data-lv="${i}" aria-pressed="${i === selected}"><b>${i + 1} · ${lv.name}</b><span>${b ? `Best ${b.score.toFixed(1)} / 10` : "Not landed yet"}</span></button>`;
    }).join("")}</div>`;
  }
  function modeSwitch() {
    const btn = (d: Difficulty, label: string, note: string) =>
      `<button class="rg-mode" type="button" data-mode="${d}" aria-pressed="${difficulty === d}"><b>${label}</b><span>${note}</span></button>`;
    return `<div class="rg-modes" role="group" aria-label="Mode">${btn("easy", "Easy", "Floaty, levels itself")}${btn("normal", "Normal", "Forgiving landings")}${btn("challenge", "Challenge", "Earth gravity, no help")}</div>`;
  }
  function controlsSwitch() {
    const btn = (c: Controls, label: string, note: string) =>
      `<button class="rg-mode" type="button" data-controls="${c}" aria-pressed="${controls === c}"><b>${label}</b><span>${note}</span></button>`;
    return `<div class="rg-modes two" role="group" aria-label="Controls">${btn("simple", "Simple controls", "Lift and tilt")}${btn("pro", "Pro controls", "Fire each thruster")}</div>`;
  }
  function controlsHelp() {
    const lim = LIMITS[difficulty];
    const k = (desk: string, touch: string) => (touchUi ? `<kbd>${touch}</kbd>` : desk);
    const help = controls === "simple"
      ? `<div class="rg-controls">
      <span>${k("<kbd>↑</kbd> <kbd>Space</kbd>", "Lift")}</span><span>Hold to climb. Let go and the car sinks gently and stops drifting.</span>
      <span>${k("<kbd>←</kbd> <kbd>→</kbd>", "◀ ▶")}</span><span>Fly left or right</span>
      ${touchUi ? "" : "<span><kbd>R</kbd></span><span>Restart the test</span>"}
    </div>`
      : `<div class="rg-controls">
      <span>${k("<kbd>←</kbd> <kbd>A</kbd>", "Left")}</span><span>Left thruster: lifts the tail and pushes you right</span>
      <span>${k("<kbd>→</kbd> <kbd>D</kbd>", "Right")}</span><span>Right thruster: lifts the nose and pushes you left</span>
      <span>${k("<kbd>↑</kbd> <kbd>Space</kbd>", "Both")}</span><span>Both thrusters: straight up</span>
      ${touchUi ? "" : "<span><kbd>R</kbd></span><span>Restart the test</span>"}
    </div>`;
    return `${help}
      <p class="dim">Touch down under ${lim.vs} m/s, drifting under ${lim.hs} m/s, and within ${lim.tilt}° of level. Each landing is scored out of 10.</p>`;
  }
  function showBriefing() {
    paused = true;
    const lv = LEVELS[selected];
    card.innerHTML = `
      <div class="eyebrow">Roadster thruster test · ${selected + 1} of ${LEVELS.length}</div>
      <h1>${lv.name}</h1>
      <p>${lv.brief}</p>
      ${modeSwitch()}
      ${controlsSwitch()}
      ${levelButtons()}
      ${controlsHelp()}
      <div class="row"><button class="primary" type="button" data-act="go">Start test</button></div>`;
    overlay.hidden = false;
    card.querySelectorAll<HTMLButtonElement>(".rg-lvbtn").forEach(b => b.addEventListener("click", () => {
      selected = Number(b.dataset.lv);
      startLevel(selected, true);
      showBriefing();
    }));
    card.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => b.addEventListener("click", () => {
      difficulty = b.dataset.mode as Difficulty;
      store.set("roadster.difficulty", difficulty);
      startLevel(selected, true);
      showBriefing();
    }));
    card.querySelectorAll<HTMLButtonElement>("[data-controls]").forEach(b => b.addEventListener("click", () => {
      controls = b.dataset.controls === "pro" ? "pro" : "simple";
      store.set("roadster.controls", controls);
      root.classList.toggle("simple", controls === "simple");
      showBriefing();
    }));
    card.querySelector('[data-act="go"]')!.addEventListener("click", () => { ensureAudio(); startLevel(selected); });
  }
  function showResult() {
    paused = true;
    const r = sim.result!, lv = LEVELS[sim.level];
    const hasNext = sim.level < LEVELS.length - 1;
    if (sim.mode === "landed" && r.td) {
      const prev = best[bestKey(sim.level)];
      const isBest = !prev || r.td.score > prev.score;
      if (isBest) { best[bestKey(sim.level)] = { score: r.td.score, vs: r.td.vs }; store.set("roadster.best.v2", best); }
      card.innerHTML = `
        <div class="eyebrow">Test ${sim.level + 1} · ${lv.name} · ${MODE_LABEL[difficulty]}</div>
        <div class="rg-score"><b>${r.td.score.toFixed(1)}</b><span>/ 10</span>${isBest && prev ? '<em>New best</em>' : ""}</div>
        <h1 class="ok">${rating(r.td)}</h1>
        <div class="rg-stats">
          <div><span class="k">Touchdown</span><span class="v">${r.td.vs.toFixed(1)} m/s</span></div>
          <div><span class="k">Drift</span><span class="v">${r.td.hs.toFixed(1)} m/s</span></div>
          <div><span class="k">Tilt</span><span class="v">${r.td.tilt.toFixed(0)}°</span></div>
          <div><span class="k">Off centre</span><span class="v">${r.td.offset.toFixed(1)} m</span></div>
          <div><span class="k">Gas left</span><span class="v">${Math.round(r.gas)}%</span></div>
          <div><span class="k">Flight time</span><span class="v">${r.time.toFixed(1)} s</span></div>
        </div>
        <div class="row">
          <button class="ghost" type="button" data-act="again">Fly again</button>
          <button class="primary" type="button" data-act="next">${hasNext ? "Next test" : "Back to test 1"}</button>
        </div>`;
      card.querySelector('[data-act="next"]')!.addEventListener("click", () => {
        selected = hasNext ? sim.level + 1 : 0;
        startLevel(selected, true);
        showBriefing();
      });
    } else {
      card.innerHTML = `
        <div class="eyebrow">Test ${sim.level + 1} · ${lv.name}</div>
        <h1 class="bad">Crashed</h1>
        <p>${r.reason ?? ""}</p>
        <div class="row">
          <button class="ghost" type="button" data-act="menu">All tests</button>
          <button class="primary" type="button" data-act="again">Try again</button>
        </div>`;
      card.querySelector('[data-act="menu"]')!.addEventListener("click", () => {
        selected = sim.level;
        startLevel(selected, true);
        showBriefing();
      });
    }
    card.querySelector('[data-act="again"]')!.addEventListener("click", () => startLevel(sim.level));
    overlay.hidden = false;
  }

  function releaseControls() {
    keys.clear();
    padState.L = padState.R = padState.TL = padState.TR = padState.Lift = false;
    syncKeys();
  }
  function showPause() {
    if (paused || sim.mode !== "fly") return;
    paused = true;
    releaseControls();
    const lv = LEVELS[sim.level];
    card.innerHTML = `
      <div class="eyebrow">Test ${sim.level + 1} · ${lv.name} · ${MODE_LABEL[difficulty]}</div>
      <h1>Paused</h1>
      <div class="row">
        <button class="ghost" type="button" data-act="menu">All tests</button>
        <button class="ghost" type="button" data-act="restart">Restart</button>
        <button class="primary" type="button" data-act="resume">Resume</button>
      </div>`;
    card.querySelector('[data-act="resume"]')!.addEventListener("click", resume);
    card.querySelector('[data-act="restart"]')!.addEventListener("click", () => startLevel(sim.level));
    card.querySelector('[data-act="menu"]')!.addEventListener("click", () => {
      selected = sim.level;
      startLevel(selected, true);
      showBriefing();
    });
    overlay.hidden = false;
    card.querySelector<HTMLButtonElement>('[data-act="resume"]')!.focus();
  }
  function resume() {
    paused = false;
    overlay.hidden = true;
  }
  pauseBtn.addEventListener("click", showPause);

  function startLevel(i: number, keepPaused = false) {
    sim = newSim(i, difficulty);
    selected = i;
    particles = [];
    resultTimer = 0;
    cam.x = sim.x;
    cam.y = targetCamY();
    cam.shake = 0;
    ref("lvlName").textContent = `Test ${i + 1} · ${LEVELS[i].name}`;
    if (!keepPaused) { paused = false; overlay.hidden = true; }
  }

  // ---- particles ----
  function emitPlume(side: number) {
    const p = toWorld(sim, NOZZLES[side]);
    const dn = [Math.sin(sim.a), -Math.cos(sim.a)]; // car-down direction
    for (let k = 0; k < 2; k++) {
      const sp = 9 + Math.random() * 5, j = (Math.random() - 0.5) * 2.4;
      particles.push({ x: p[0], y: p[1], vx: sim.vx + dn[0] * sp + j, vy: sim.vy + dn[1] * sp + j * 0.3, life: 0, max: 0.5 + Math.random() * 0.4, r: 0.18, kind: "gas" });
    }
  }
  function emitCrash() {
    for (let k = 0; k < 90; k++) {
      const a = Math.random() * Math.PI, sp = 3 + Math.random() * 12;
      particles.push({ x: sim.x, y: sim.y, vx: Math.cos(a) * sp + sim.vx * 0.3, vy: Math.sin(a) * sp, life: 0, max: 0.8 + Math.random() * 1.2, r: 0.12 + Math.random() * 0.2, kind: k % 3 ? "spark" : "smoke" });
    }
  }
  function emitDust() {
    for (let k = 0; k < 26; k++) {
      const dir = k % 2 ? 1 : -1, sp = 2 + Math.random() * 5;
      particles.push({ x: sim.x + dir * Math.random(), y: sim.y + WHEEL_Y + 0.1, vx: dir * sp, vy: Math.random() * 1.5, life: 0, max: 0.7 + Math.random() * 0.6, r: 0.25, kind: "dust" });
    }
  }
  function updateParticles(dt: number) {
    const lv = sim.lv;
    for (const p of particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "spark") p.vy -= G * dt;
      else { p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt; p.r += dt * (p.kind === "gas" ? 0.8 : 1.0); }
      const gy = groundY(lv, p.x);
      if (p.y < gy) {
        p.y = gy;
        if (p.kind === "gas") p.vx += (Math.random() < 0.5 ? -1 : 1) * Math.abs(p.vy) * 0.6;
        p.vy = Math.abs(p.vy) * 0.15;
      }
    }
    particles = particles.filter(p => p.life < p.max);
    if (particles.length > 700) particles.splice(0, particles.length - 700);
  }

  // ---- camera & projection ----
  // Leave room under the car for the thumb pads (less in a short landscape view).
  const bottomMarginM = () => (touchUi ? Math.min(190, H * 0.28) : 90) / PPM;
  const targetCamY = () => Math.max(sim.y + 1.5, groundY(sim.lv, sim.x) + H / 2 / PPM - bottomMarginM());
  const sx = (x: number) => (x - cam.x) * PPM + W / 2;
  const sy = (y: number) => H / 2 - (y - cam.y) * PPM;

  // ---- drawing ----
  function drawSky(time: number) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#070a17"); g.addColorStop(0.55, "#1c1a3f"); g.addColorStop(0.85, "#4a2d55"); g.addColorStop(1, "#7a3f4f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const x = ((s.x * W * 1.6 - cam.x * PPM * 0.04) % W + W) % W;
      const y = s.y * H + cam.y * PPM * 0.02;
      ctx.globalAlpha = reduceMotion ? 0.7 : 0.45 + 0.35 * Math.sin(time * 0.0015 + s.tw);
      ctx.fillStyle = "#dfe6ff";
      ctx.fillRect(x, y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // far ridges, slow parallax
    const base = H / 2 + cam.y * PPM * 0.3 + PPM * 3;
    ctx.fillStyle = "#2a2147";
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let px = 0; px <= W + 8; px += 8) {
      const wx = cam.x * 0.3 + (px - W / 2) / PPM;
      ctx.lineTo(px, base - farRidge(wx) * PPM * 0.55);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    const base2 = H / 2 + cam.y * PPM * 0.55 + PPM * 4;
    ctx.fillStyle = "#1d1734";
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let px = 0; px <= W + 8; px += 8) {
      const wx = cam.x * 0.55 + (px - W / 2) / PPM;
      ctx.lineTo(px, base2 - (4 + 2.4 * Math.sin(wx * 0.05 + 4) + 1.4 * Math.sin(wx * 0.11)) * PPM * 0.6);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  function drawTerrain(time: number) {
    const lv = sim.lv, t = lv.terrain;
    const g = ctx.createLinearGradient(0, sy(40), 0, sy(-10));
    g.addColorStop(0, "#5b3a3a"); g.addColorStop(1, "#2a1b24");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(sx(t[0][0]), H + 10);
    for (const [x, y] of t) ctx.lineTo(sx(x), sy(y));
    ctx.lineTo(sx(t[t.length - 1][0]), H + 10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#c07a5e"; ctx.lineWidth = 2;
    ctx.beginPath();
    t.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
    ctx.stroke();
    drawPad(lv.start, groundY(lv, (lv.start[0] + lv.start[1]) / 2), false, time);
    drawPad(lv.target, groundY(lv, (lv.target[0] + lv.target[1]) / 2), true, time);
  }

  function drawPad([x1, x2]: [number, number], y: number, target: boolean, time: number) {
    const L = sx(x1), R = sx(x2), top = sy(y), h = Math.max(4, 0.35 * PPM);
    ctx.fillStyle = target ? "#3c4152" : "#33364a";
    ctx.fillRect(L, top - 1, R - L, h);
    ctx.fillStyle = target ? "#46e39a" : "#ffbb4d";
    ctx.globalAlpha = 0.85;
    const stripe = Math.max(4, 0.6 * PPM);
    for (let x = L + stripe * 0.5; x < R - stripe; x += stripe * 2) ctx.fillRect(x, top - 1, stripe, Math.max(2, h * 0.28));
    ctx.globalAlpha = 1;
    const blink = reduceMotion ? 1 : Math.sin(time * 0.006) > 0 ? 1 : 0.35;
    for (const bx of [L, R]) {
      ctx.fillStyle = "#555b70"; ctx.fillRect(bx - 1.5, top - PPM * 1.2, 3, PPM * 1.2);
      ctx.globalAlpha = target ? blink : 0.7;
      ctx.fillStyle = target ? "#46e39a" : "#ffbb4d";
      ctx.beginPath(); ctx.arc(bx, top - PPM * 1.25, Math.max(2.5, PPM * 0.14), 0, Math.PI * 2); ctx.fill();
      if (target) { ctx.globalAlpha = 0.18 * blink; ctx.beginPath(); ctx.arc(bx, top - PPM * 1.25, PPM * 0.6, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }

  function drawShadow() {
    const gy = groundY(sim.lv, sim.x), alt = sim.y + WHEEL_Y - gy;
    if (alt > 30 || sim.mode === "crash") return;
    const k = Math.max(0, 1 - alt / 30);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * k})`;
    ctx.beginPath(); ctx.ellipse(sx(sim.x), sy(gy) + 1, PPM * 2.3 * (0.6 + 0.4 * k), PPM * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawParticles(kinds: ParticleKind[]) {
    for (const p of particles) {
      if (!kinds.includes(p.kind)) continue;
      const f = p.life / p.max;
      if (p.kind === "gas") ctx.fillStyle = `rgba(200,232,255,${0.22 * (1 - f)})`;
      else if (p.kind === "dust") ctx.fillStyle = `rgba(192,140,110,${0.35 * (1 - f)})`;
      else if (p.kind === "smoke") ctx.fillStyle = `rgba(70,64,80,${0.6 * (1 - f)})`;
      else ctx.fillStyle = `rgba(255,${(160 + 80 * (1 - f)) | 0},90,${1 - f})`;
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), Math.max(1, p.r * PPM), 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawCar() {
    ctx.save();
    ctx.translate(sx(sim.x), sy(sim.y));
    ctx.rotate(-sim.a);
    ctx.scale(PPM, -PPM); // car space: metres, y up
    const crashed = sim.mode === "crash";

    // thruster plumes (cold gas: pale, fast, flickering)
    [sim.L, sim.R].forEach((th, i) => {
      if (th < 0.03) return;
      const [nx, ny] = NOZZLES[i];
      const len = (0.5 + 0.9 * th) + (reduceMotion ? 0.3 : Math.random() * 0.6) * th;
      const fg = ctx.createLinearGradient(0, ny, 0, ny - len);
      fg.addColorStop(0, "rgba(255,255,255,0.95)"); fg.addColorStop(0.3, "rgba(168,220,255,0.75)"); fg.addColorStop(1, "rgba(168,220,255,0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(nx - 0.13, ny);
      ctx.quadraticCurveTo(nx - 0.32, ny - len * 0.5, nx, ny - len);
      ctx.quadraticCurveTo(nx + 0.32, ny - len * 0.5, nx + 0.13, ny);
      ctx.closePath(); ctx.fill();
    });

    const body = new Path2D();
    body.moveTo(2.22, -0.32);
    body.lineTo(2.3, -0.12);
    body.quadraticCurveTo(2.32, 0.08, 1.9, 0.14);
    body.lineTo(1.0, 0.26);
    body.quadraticCurveTo(0.55, 0.32, 0.25, 0.5);
    body.quadraticCurveTo(-0.15, 0.67, -0.6, 0.63);
    body.quadraticCurveTo(-1.4, 0.53, -1.95, 0.28);
    body.quadraticCurveTo(-2.27, 0.18, -2.25, 0.0);
    body.lineTo(-2.2, -0.32);
    body.closePath();
    const bg = ctx.createLinearGradient(0, 0.65, 0, -0.32);
    if (crashed) { bg.addColorStop(0, "#4a3438"); bg.addColorStop(1, "#1d1418"); }
    else { bg.addColorStop(0, "#ff4a5c"); bg.addColorStop(0.45, "#d0172f"); bg.addColorStop(1, "#6e0a18"); }
    ctx.fillStyle = bg;
    ctx.fill(body);

    ctx.strokeStyle = crashed ? "rgba(255,255,255,0.08)" : "rgba(255,220,225,0.55)";
    ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(2.1, 0.1); ctx.lineTo(1.0, 0.22); ctx.moveTo(-0.9, 0.5); ctx.quadraticCurveTo(-1.5, 0.4, -1.9, 0.22); ctx.stroke();

    ctx.fillStyle = "#0d1020";
    ctx.beginPath(); ctx.moveTo(0.33, 0.45); ctx.quadraticCurveTo(-0.1, 0.61, -0.6, 0.59); ctx.quadraticCurveTo(-1.1, 0.53, -1.38, 0.38); ctx.lineTo(-0.1, 0.36); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(168,220,255,0.18)";
    ctx.beginPath(); ctx.moveTo(0.2, 0.45); ctx.quadraticCurveTo(-0.05, 0.56, -0.35, 0.58); ctx.lineTo(-0.2, 0.42); ctx.closePath(); ctx.fill();

    ctx.fillStyle = crashed ? "#333" : "#eaf4ff"; ctx.fillRect(1.95, 0.02, 0.3, 0.06);
    ctx.fillStyle = crashed ? "#3a1a1f" : "#ff2a3d"; ctx.fillRect(-2.27, 0.04, 0.12, 0.1);

    for (const [wx] of WHEELS) {
      ctx.fillStyle = "#0a0b12"; ctx.beginPath(); ctx.arc(wx, -0.3, 0.4, 0, Math.PI); ctx.fill();
      ctx.fillStyle = "#15161d"; ctx.beginPath(); ctx.arc(wx, -0.3, 0.33, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7d8394"; ctx.beginPath(); ctx.arc(wx, -0.3, 0.19, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2a2d38"; ctx.beginPath(); ctx.arc(wx, -0.3, 0.07, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#3b3f4c";
    for (const [nx, ny] of NOZZLES) {
      ctx.beginPath(); ctx.moveTo(nx - 0.12, ny + 0.06); ctx.lineTo(nx + 0.12, ny + 0.06); ctx.lineTo(nx + 0.08, ny - 0.04); ctx.lineTo(nx - 0.08, ny - 0.04); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawTargetArrow() {
    const [x1, x2] = sim.lv.target, cx = (x1 + x2) / 2, cy = groundY(sim.lv, cx);
    const px = sx(cx), py = sy(cy);
    const m = 34, top = 120;
    if (px > m && px < W - m && py > top && py < H - m) return;
    const ax = Math.min(W - m, Math.max(m, px)), ay = Math.min(H - 150, Math.max(top + 30, py));
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.atan2(py - ay, px - ax));
    ctx.fillStyle = "#46e39a";
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
    const dist = Math.hypot(cx - sim.x, cy - (sim.y + WHEEL_Y));
    ctx.font = `600 12px ${dataFont}`;
    ctx.fillStyle = "#46e39a";
    ctx.textAlign = ax > W / 2 ? "right" : "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(dist)} m`, ax + (ax > W / 2 ? -20 : 20), ay);
  }

  // ---- HUD ----
  const band = (v: number, okMax: number, warnMax: number) => (v <= okMax ? "ok" : v <= warnMax ? "warn" : "bad");
  function setRo(node: HTMLElement, text: string, unit: string, state: string | null) {
    const v = node.querySelector(".v") as HTMLElement;
    const html = `${text}<small>${unit}</small>`;
    if (v.innerHTML !== html) v.innerHTML = html;
    if (state) node.dataset.s = state;
    else delete node.dataset.s;
  }
  function updateHud() {
    const canPause = !paused && sim.mode === "fly";
    if (pauseBtn.hidden === canPause) pauseBtn.hidden = !canPause;
    const alt = Math.max(0, sim.y + WHEEL_Y - groundY(sim.lv, sim.x));
    const air = !sim.grounded && sim.mode === "fly";
    const lim = sim.limits;
    setRo(roAlt, alt.toFixed(1), "m", null);
    const desc = -sim.vy;
    setRo(roVs, `${desc > 0.05 ? "↓" : sim.vy > 0.05 ? "↑" : ""}${Math.abs(sim.vy).toFixed(1)}`, "m/s", air && desc > 0 ? band(desc, 0.6 * lim.vs, lim.vs) : null);
    setRo(roHs, Math.abs(sim.vx).toFixed(1), "m/s", air ? band(Math.abs(sim.vx), 0.6 * lim.hs, lim.hs) : null);
    const tilt = Math.abs(sim.a) * 180 / Math.PI;
    setRo(roTilt, tilt.toFixed(0), "°", air ? band(tilt, 0.6 * lim.tilt, lim.tilt) : null);
    gasBar.style.width = `${sim.gas}%`;
    gasBar.classList.toggle("low", sim.gas < 20);
    gasPct.textContent = `${Math.round(sim.gas)}%`;
    padL.classList.toggle("on", sim.L > 0.1 || padState.L);
    padR.classList.toggle("on", sim.R > 0.1 || padState.R);
  }

  // ---- main loop ----
  let last = performance.now(), acc = 0, plumeAcc = 0, raf = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) {
      acc += dt;
      while (acc >= DT) { simStep(sim, readInput(), DT); acc -= DT; }
    }
    for (const ev of sim.events) {
      if (ev === "crash") { emitCrash(); cam.shake = reduceMotion ? 0 : 1; thud(); resultTimer = 1.4; }
      if (ev === "landed") resultTimer = 1.0;
      if (ev === "touchdown" || ev === "liftoff") emitDust();
    }
    sim.events.length = 0;
    if (resultTimer > 0) {
      resultTimer -= dt;
      if (resultTimer <= 0 && overlay.hidden) showResult();
    }

    plumeAcc += dt;
    while (plumeAcc > 1 / 60) {
      plumeAcc -= 1 / 60;
      if (Math.random() < sim.L) emitPlume(0);
      if (Math.random() < sim.R) emitPlume(1);
    }
    updateParticles(dt);

    cam.x += (sim.x + sim.vx * 0.5 - cam.x) * Math.min(1, dt * 3);
    cam.y += (targetCamY() - cam.y) * Math.min(1, dt * 3);
    cam.shake = Math.max(0, cam.shake - dt * 1.5);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (cam.shake > 0) ctx.translate((Math.random() - 0.5) * 12 * cam.shake, (Math.random() - 0.5) * 12 * cam.shake);
    drawSky(now);
    drawTerrain(now);
    drawShadow();
    drawParticles(["dust", "gas"]);
    drawCar();
    drawParticles(["smoke", "spark"]);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawTargetArrow();
    updateHud();

    if (audio) {
      const n = sim.L + sim.R;
      audio.gain.gain.setTargetAtTime(soundOn && !paused ? n * 0.11 : 0, audio.ac.currentTime, 0.03);
    }
    raf = requestAnimationFrame(frame);
  }

  startLevel(0, true);
  showBriefing();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    cleanups.forEach(fn => fn());
    if (audio) void audio.ac.close();
    root.innerHTML = "";
  };
}

import { Ball, LineInstrument, stepWorld } from "./physics.js";
import { AudioEngine, INSTRUMENT_IDS } from "./audio.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const audio = new AudioEngine();

const COLOR_SLOTS = [
  { id: "white", hex: "#f5f5f0", instrument: "marimba" },
  { id: "coral", hex: "#ff6b5c", instrument: "pluck" },
  { id: "azure", hex: "#4c9aff", instrument: "synth" },
  { id: "chartreuse", hex: "#b4e23c", instrument: "bell" },
  { id: "violet", hex: "#b57bff", instrument: "drum" },
];

const world = {
  width: 0,
  height: 0,
  gravity: 620, // px/s^2 (fixed mode)
  airFriction: 0.15,
  restitution: 0.85,
  gravityMode: "fixed", // 'fixed' | 'real'
};

let lines = [];
let balls = [];
let droppers = [];
let currentColorId = "white";
let running = true;
let lastTime = performance.now();

const HIT_LINE = 14; // px hit tolerance for tapping a line body
const HIT_ENDPOINT = 16; // px hit tolerance for endpoints
const HIT_HANDLE = 16; // px hit tolerance for midpoint handle
const HIT_DROPPER = 30; // px hit tolerance for droppers
const MIN_LINE_LEN = 18;
const LONG_PRESS_MS = 480;
const MOVE_CANCEL_PX = 9;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 30;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function colorFor(colorId) {
  return COLOR_SLOTS.find((c) => c.id === colorId) || COLOR_SLOTS[0];
}

// ---------------------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------------------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  world.width = w;
  world.height = h;
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------------------
// Droppers
// ---------------------------------------------------------------------------

function createDropper(x, y) {
  droppers.push({
    id: uid(),
    x,
    y,
    tempo: 0.5, // 0..1 slider value, mapped to interval
    variability: 0,
    nextDropAt: performance.now() + 300,
  });
  hideHintSoon();
}

function tempoToIntervalMs(tempoSliderValue) {
  // 0 -> slow (every 3000ms), 1 -> fast (every 90ms). Exponential feel.
  const minMs = 90;
  const maxMs = 3000;
  return maxMs * Math.pow(minMs / maxMs, tempoSliderValue);
}

function scheduleDrop(dropper, now) {
  const baseInterval = tempoToIntervalMs(dropper.tempo);
  const variance = 1 + (Math.random() * 2 - 1) * dropper.variability;
  const interval = Math.max(45, baseInterval * variance);
  dropper.nextDropAt = now + interval;
}

function updateDroppers(now) {
  for (const d of droppers) {
    if (now >= d.nextDropAt) {
      balls.push(new Ball(d.x, d.y, (Math.random() - 0.5) * 12, 0));
      scheduleDrop(d, now);
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function drawDropper(d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.beginPath();
  ctx.moveTo(-13, -10);
  ctx.lineTo(13, -10);
  ctx.lineTo(4, 12);
  ctx.lineTo(-4, 12);
  ctx.closePath();
  ctx.fillStyle = "rgba(76, 211, 194, 0.18)";
  ctx.strokeStyle = "#4cd3c2";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLine(line, nowMs) {
  const color = colorFor(line.colorId);
  const flashing = nowMs < line.flashUntil;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = color.hex;
  ctx.shadowColor = color.hex;
  ctx.shadowBlur = flashing ? 26 : 9;
  ctx.globalAlpha = flashing ? 1 : 0.92;
  ctx.lineWidth = flashing ? 5.5 : 4;
  ctx.beginPath();
  ctx.moveTo(line.x1, line.y1);
  ctx.lineTo(line.x2, line.y2);
  ctx.stroke();
  ctx.restore();

  // midpoint handle
  ctx.save();
  ctx.beginPath();
  ctx.arc(line.midX, line.midY, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.shadowBlur = 0;
  ctx.fill();
  ctx.restore();
}

function drawBall(ball) {
  ctx.save();
  for (let i = 0; i < ball.trail.length; i++) {
    const p = ball.trail[i];
    const alpha = (i / ball.trail.length) * 0.25;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ball.radius * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(236,237,245,${alpha})`;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#ecedf5";
  ctx.shadowColor = "#ecedf5";
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();
}

function drawPreviewLine() {
  if (!drawState.active) return;
  ctx.save();
  ctx.lineCap = "round";
  const color = colorFor(currentColorId);
  ctx.strokeStyle = color.hex;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 4;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(drawState.x1, drawState.y1);
  ctx.lineTo(drawState.x2, drawState.y2);
  ctx.stroke();
  ctx.restore();
}

function render(nowMs) {
  ctx.clearRect(0, 0, world.width, world.height);
  for (const line of lines) drawLine(line, nowMs);
  for (const d of droppers) drawDropper(d);
  for (const b of balls) drawBall(b);
  drawPreviewLine();
}

// ---------------------------------------------------------------------------
// Physics + audio collision hook
// ---------------------------------------------------------------------------

function onCollision(ball, line, hit) {
  line.flashUntil = performance.now() + 90;
  audio.play(line.colorInstrumentOverride || colorFor(line.colorId).instrument, hit.speed);
}

function tick(now) {
  const dt = Math.min(0.032, (now - lastTime) / 1000);
  lastTime = now;

  if (running) {
    updateDroppers(now);
    balls = stepWorld(balls, lines, world, dt, onCollision);
  }
  render(now);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------------------
// Real gravity via device motion (iOS requires an explicit permission tap)
// ---------------------------------------------------------------------------

let motionActive = false;
function enableRealGravity() {
  const DME = window.DeviceMotionEvent;
  const start = () => {
    motionActive = true;
    window.addEventListener("devicemotion", handleMotion);
  };
  if (DME && typeof DME.requestPermission === "function") {
    DME.requestPermission()
      .then((res) => {
        if (res === "granted") start();
        else setGravityMode("fixed", true);
      })
      .catch(() => setGravityMode("fixed", true));
  } else if (DME) {
    start();
  } else {
    setGravityMode("fixed", true);
  }
}
function disableRealGravity() {
  motionActive = false;
  window.removeEventListener("devicemotion", handleMotion);
}
function handleMotion(e) {
  const g = e.accelerationIncludingGravity;
  if (!g) return;
  // Map device tilt to a 2D gravity vector on screen.
  const gx = g.x || 0;
  const gy = g.y || 0;
  const mag = Math.hypot(gx, gy) || 1;
  const scale = 620;
  world.gravityX = (gx / 9.8) * scale * -1;
  world.gravity = Math.max(80, Math.min(1400, (gy / 9.8) * scale * -1));
}

// ---------------------------------------------------------------------------
// Instrument color selector UI
// ---------------------------------------------------------------------------

const colorSelectorEl = document.getElementById("colorSelector");
function renderColorSelector() {
  colorSelectorEl.innerHTML = "";
  for (const slot of COLOR_SLOTS) {
    const dot = document.createElement("button");
    dot.className = "color-dot" + (slot.id === currentColorId ? " active" : "");
    dot.style.background = slot.hex;
    dot.style.setProperty("--dot-color", slot.hex);
    dot.setAttribute("aria-label", slot.id);
    dot.addEventListener("click", () => {
      currentColorId = slot.id;
      renderColorSelector();
    });
    colorSelectorEl.appendChild(dot);
  }
}
renderColorSelector();

// ---------------------------------------------------------------------------
// Hint auto-hide
// ---------------------------------------------------------------------------

const hintEl = document.getElementById("hint");
let hintHideTimer = null;
function hideHintSoon() {
  if (hintHideTimer) return;
  hintHideTimer = setTimeout(() => {
    hintEl.style.opacity = "0";
  }, 1400);
}

// ---------------------------------------------------------------------------
// Sheets (menu / tempo) plumbing
// ---------------------------------------------------------------------------

const scrim = document.getElementById("scrim");
const menuSheet = document.getElementById("menuSheet");
const tempoSheet = document.getElementById("tempoSheet");

function openSheet(sheet) {
  scrim.classList.add("open");
  sheet.classList.add("open");
}
function closeSheets() {
  scrim.classList.remove("open");
  menuSheet.classList.remove("open");
  tempoSheet.classList.remove("open");
  activeDropperForTempo = null;
}
scrim.addEventListener("click", closeSheets);
document.getElementById("closeMenu").addEventListener("click", closeSheets);
document.getElementById("closeTempo").addEventListener("click", closeSheets);

document.getElementById("menuBtn").addEventListener("click", () => {
  renderInstrumentList();
  renderSaveList();
  openSheet(menuSheet);
});

// ---- Instrument assignment list ----

const instrumentListEl = document.getElementById("instrumentList");
function renderInstrumentList() {
  instrumentListEl.innerHTML = "";
  for (const slot of COLOR_SLOTS) {
    const row = document.createElement("div");
    row.className = "row";

    const label = document.createElement("div");
    label.className = "row-label";
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = slot.hex;
    label.appendChild(sw);
    label.appendChild(document.createTextNode(capitalize(slot.id)));

    const select = document.createElement("select");
    for (const instId of INSTRUMENT_IDS) {
      const opt = document.createElement("option");
      opt.value = instId;
      opt.textContent = capitalize(instId);
      if (instId === slot.instrument) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      slot.instrument = select.value;
    });

    row.appendChild(label);
    row.appendChild(select);
    instrumentListEl.appendChild(row);
  }
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- Physics modifier ----

const gravitySlider = document.getElementById("gravitySlider");
const frictionSlider = document.getElementById("frictionSlider");
const bounceSlider = document.getElementById("bounceSlider");
const gravityVal = document.getElementById("gravityVal");
const frictionVal = document.getElementById("frictionVal");
const bounceVal = document.getElementById("bounceVal");
const gravityModeToggle = document.getElementById("gravityModeToggle");

gravitySlider.addEventListener("input", () => {
  world.gravity = parseFloat(gravitySlider.value) * 620;
  gravityVal.textContent = parseFloat(gravitySlider.value).toFixed(2);
});
frictionSlider.addEventListener("input", () => {
  world.airFriction = parseFloat(frictionSlider.value);
  frictionVal.textContent = world.airFriction.toFixed(2);
});
bounceSlider.addEventListener("input", () => {
  world.restitution = parseFloat(bounceSlider.value);
  bounceVal.textContent = world.restitution.toFixed(2);
});

function setGravityMode(mode, silent) {
  world.gravityMode = mode;
  [...gravityModeToggle.children].forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.mode === mode)
  );
  gravitySlider.disabled = mode === "real";
  if (mode === "real") {
    if (!silent) enableRealGravity();
  } else {
    disableRealGravity();
  }
}
gravityModeToggle.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  setGravityMode(btn.dataset.mode);
});

// ---- Save / load ----

const SAVE_KEY = "soundrop_rebirth_saves_v1";

function loadSaveList() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]");
  } catch {
    return [];
  }
}
function persistSaveList(list) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("Impossibile salvare: storage pieno o non disponibile.", e);
  }
}

function serializeGame() {
  return {
    lines: lines.map((l) => l.toJSON()),
    droppers: droppers.map((d) => ({
      x: d.x,
      y: d.y,
      tempo: d.tempo,
      variability: d.variability,
    })),
    colorInstruments: COLOR_SLOTS.map((s) => ({ id: s.id, instrument: s.instrument })),
    world: {
      gravity: world.gravity,
      airFriction: world.airFriction,
      restitution: world.restitution,
      gravityMode: world.gravityMode,
    },
  };
}

function applyGame(data) {
  lines = data.lines.map((l) => new LineInstrument(l.x1, l.y1, l.x2, l.y2, l.colorId));
  droppers = data.droppers.map((d) => ({
    id: uid(),
    x: d.x,
    y: d.y,
    tempo: d.tempo,
    variability: d.variability,
    nextDropAt: performance.now() + 400,
  }));
  balls = [];
  if (data.colorInstruments) {
    for (const entry of data.colorInstruments) {
      const slot = colorFor(entry.id);
      slot.instrument = entry.instrument;
    }
  }
  if (data.world) {
    world.gravity = data.world.gravity;
    world.airFriction = data.world.airFriction;
    world.restitution = data.world.restitution;
    gravitySlider.value = (world.gravity / 620).toFixed(2);
    frictionSlider.value = world.airFriction;
    bounceSlider.value = world.restitution;
    gravityVal.textContent = (world.gravity / 620).toFixed(2);
    frictionVal.textContent = world.airFriction.toFixed(2);
    bounceVal.textContent = world.restitution.toFixed(2);
    setGravityMode(data.world.gravityMode || "fixed", true);
  }
}

const saveListEl = document.getElementById("saveList");
function renderSaveList() {
  const list = loadSaveList();
  saveListEl.innerHTML = "";
  if (list.length === 0) {
    const p = document.createElement("div");
    p.className = "empty-note";
    p.textContent = "Nessun soundrop salvato ancora.";
    saveListEl.appendChild(p);
    return;
  }
  list
    .slice()
    .reverse()
    .forEach((entry) => {
      const item = document.createElement("div");
      item.className = "save-item";
      const info = document.createElement("div");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = entry.name;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = new Date(entry.savedAt).toLocaleString("it-IT");
      info.appendChild(name);
      info.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "actions";
      const loadBtn = document.createElement("button");
      loadBtn.className = "ghost";
      loadBtn.textContent = "Carica";
      loadBtn.addEventListener("click", () => {
        applyGame(entry.data);
        closeSheets();
      });
      const delBtn = document.createElement("button");
      delBtn.className = "danger-ghost";
      delBtn.textContent = "Elimina";
      delBtn.addEventListener("click", () => {
        const updated = loadSaveList().filter((e) => e.id !== entry.id);
        persistSaveList(updated);
        renderSaveList();
      });
      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      item.appendChild(info);
      item.appendChild(actions);
      saveListEl.appendChild(item);
    });
}

document.getElementById("saveGameBtn").addEventListener("click", () => {
  const list = loadSaveList();
  const entry = {
    id: uid(),
    name: `Soundrop ${list.length + 1}`,
    savedAt: Date.now(),
    data: serializeGame(),
  };
  list.push(entry);
  persistSaveList(list);
  renderSaveList();
});

// ---- Dropper tempo sheet ----

let activeDropperForTempo = null;
const tempoSlider = document.getElementById("tempoSlider");
const variabilitySlider = document.getElementById("variabilitySlider");
const tempoVal = document.getElementById("tempoVal");
const variabilityVal = document.getElementById("variabilityVal");

function openTempoSheet(dropper) {
  activeDropperForTempo = dropper;
  tempoSlider.value = dropper.tempo;
  variabilitySlider.value = dropper.variability;
  updateTempoLabels();
  openSheet(tempoSheet);
}
function updateTempoLabels() {
  const ms = tempoToIntervalMs(parseFloat(tempoSlider.value));
  const perSecond = 1000 / ms;
  tempoVal.textContent =
    perSecond >= 1 ? `${perSecond.toFixed(1)} al secondo` : `ogni ${(ms / 1000).toFixed(2)}s`;
  variabilityVal.textContent = `+/- x${parseFloat(variabilitySlider.value).toFixed(2)}`;
}
tempoSlider.addEventListener("input", () => {
  if (activeDropperForTempo) activeDropperForTempo.tempo = parseFloat(tempoSlider.value);
  updateTempoLabels();
});
variabilitySlider.addEventListener("input", () => {
  if (activeDropperForTempo) activeDropperForTempo.variability = parseFloat(variabilitySlider.value);
  updateTempoLabels();
});
document.getElementById("removeDropperBtn").addEventListener("click", () => {
  if (activeDropperForTempo) {
    droppers = droppers.filter((d) => d.id !== activeDropperForTempo.id);
  }
  closeSheets();
});

// ---------------------------------------------------------------------------
// Pointer input / gesture handling on the canvas
// ---------------------------------------------------------------------------

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function findDropperAt(x, y) {
  return droppers.find((d) => Math.hypot(d.x - x, d.y - y) <= HIT_DROPPER);
}
function findLineHandleAt(x, y) {
  return lines.find((l) => Math.hypot(l.midX - x, l.midY - y) <= HIT_HANDLE);
}
function findLineEndpointAt(x, y) {
  for (const l of lines) {
    if (Math.hypot(l.x1 - x, l.y1 - y) <= HIT_ENDPOINT) return { line: l, which: 1 };
    if (Math.hypot(l.x2 - x, l.y2 - y) <= HIT_ENDPOINT) return { line: l, which: 2 };
  }
  return null;
}
function findLineBodyAt(x, y) {
  return lines.find((l) => distToSegment(x, y, l.x1, l.y1, l.x2, l.y2) <= HIT_LINE);
}

const drawState = { active: false, x1: 0, y1: 0, x2: 0, y2: 0 };

let pointerMode = null; // 'drawLine' | 'dragDropper' | 'dragHandle' | 'dragEndpoint' | 'pendingTap'
let pointerStart = { x: 0, y: 0 };
let dragTarget = null;
let longPressTimer = null;
let lastTapInfo = null; // { time, x, y }
let tapCandidateWasDropper = false;

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  audio.ensureContext();
  const { x, y } = getPos(e);
  pointerStart = { x, y };

  // Double-tap check (erase a line)
  const now = performance.now();
  if (
    lastTapInfo &&
    now - lastTapInfo.time < DOUBLE_TAP_MS &&
    Math.hypot(lastTapInfo.x - x, lastTapInfo.y - y) < DOUBLE_TAP_PX
  ) {
    const target = findLineBodyAt(x, y);
    if (target) {
      lines = lines.filter((l) => l.id !== target.id);
      lastTapInfo = null;
      pointerMode = null;
      return;
    }
  }
  lastTapInfo = { time: now, x, y };

  const dropper = findDropperAt(x, y);
  if (dropper) {
    pointerMode = "dragDropper";
    dragTarget = dropper;
    tapCandidateWasDropper = true;
    return;
  }

  const endpointHit = findLineEndpointAt(x, y);
  if (endpointHit) {
    pointerMode = "dragEndpoint";
    dragTarget = endpointHit;
    return;
  }

  const handleHit = findLineHandleAt(x, y);
  if (handleHit) {
    pointerMode = "dragHandle";
    dragTarget = { line: handleHit, startX: handleHit.x1, startY: handleHit.y1, startX2: handleHit.x2, startY2: handleHit.y2, originX: x, originY: y };
    return;
  }

  // Empty space: could become a long-press (new dropper) or a line draw.
  pointerMode = "pendingTap";
  longPressTimer = setTimeout(() => {
    if (pointerMode === "pendingTap") {
      createDropper(pointerStart.x, pointerStart.y);
      pointerMode = null;
    }
  }, LONG_PRESS_MS);
});

canvas.addEventListener("pointermove", (e) => {
  const { x, y } = getPos(e);

  if (pointerMode === "pendingTap") {
    const moved = Math.hypot(x - pointerStart.x, y - pointerStart.y);
    if (moved > MOVE_CANCEL_PX) {
      clearTimeout(longPressTimer);
      pointerMode = "drawLine";
      drawState.active = true;
      drawState.x1 = pointerStart.x;
      drawState.y1 = pointerStart.y;
    } else {
      return;
    }
  }

  if (pointerMode === "drawLine") {
    drawState.x2 = x;
    drawState.y2 = y;
  } else if (pointerMode === "dragDropper") {
    dragTarget.x = x;
    dragTarget.y = y;
    tapCandidateWasDropper = false;
  } else if (pointerMode === "dragEndpoint") {
    if (dragTarget.which === 1) {
      dragTarget.line.x1 = x;
      dragTarget.line.y1 = y;
    } else {
      dragTarget.line.x2 = x;
      dragTarget.line.y2 = y;
    }
  } else if (pointerMode === "dragHandle") {
    const dx = x - dragTarget.originX;
    const dy = y - dragTarget.originY;
    dragTarget.line.x1 = dragTarget.startX + dx;
    dragTarget.line.y1 = dragTarget.startY + dy;
    dragTarget.line.x2 = dragTarget.startX2 + dx;
    dragTarget.line.y2 = dragTarget.startY2 + dy;
  }
});

canvas.addEventListener("pointerup", (e) => {
  clearTimeout(longPressTimer);
  const { x, y } = getPos(e);

  if (pointerMode === "pendingTap") {
    // A quick tap with no movement — nothing to do on empty space.
  } else if (pointerMode === "drawLine") {
    const len = Math.hypot(drawState.x2 - drawState.x1, drawState.y2 - drawState.y1);
    if (len >= MIN_LINE_LEN) {
      lines.push(
        new LineInstrument(drawState.x1, drawState.y1, drawState.x2, drawState.y2, currentColorId)
      );
      hideHintSoon();
    }
    drawState.active = false;
  } else if (pointerMode === "dragDropper") {
    if (tapCandidateWasDropper) {
      openTempoSheet(dragTarget);
    }
  }

  pointerMode = null;
  dragTarget = null;
});

canvas.addEventListener("pointercancel", () => {
  clearTimeout(longPressTimer);
  drawState.active = false;
  pointerMode = null;
  dragTarget = null;
});

// ---------------------------------------------------------------------------
// Bootstrap: a default dropper + a couple of demo lines so the field isn't empty
// ---------------------------------------------------------------------------

function bootstrapDefaultScene() {
  createDropper(Math.min(160, world.width * 0.3), 90);
  lines.push(
    new LineInstrument(world.width * 0.15, world.height * 0.45, world.width * 0.6, world.height * 0.52, "white")
  );
  lines.push(
    new LineInstrument(world.width * 0.35, world.height * 0.68, world.width * 0.85, world.height * 0.6, "azure")
  );
}
bootstrapDefaultScene();

// ---------------------------------------------------------------------------
// Service worker registration
// ---------------------------------------------------------------------------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

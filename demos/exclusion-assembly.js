// -- Layoutmaster API --
// `exclusion.assembly` composes primitive parts into a single movable spatial
// token; `form` runs the layout engine with that token as a first-class obstacle.
import { exclusion, form } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const surface = document.getElementById("surface");
const waveInput = document.getElementById("wave-input");
const playInput = document.getElementById("play-input");
const showVisualInput = document.getElementById("show-visual-input");
const showPiecesInput = document.getElementById("show-pieces-input");
const resetButton = document.getElementById("reset-button");
const status = document.getElementById("status");

const MAX_SURFACE_WIDTH = 880;
const MIN_SURFACE_HEIGHT = 700;
const FONT_FAMILY = '"Times New Roman", Times, serif';
const FONT_SIZE = 19;
const LINE_HEIGHT = 1.38;

const TEXT = `An exclusion assembly can be a tiny rig. It does not need a perfect outline or a computer vision pipeline. A developer can author a head, torso, arms, and legs as ordinary primitive parts, then rebuild the current pose whenever the interface changes.

Here the waving arm is a capsule part that Layoutmaster lowers into polygon geometry. The other limbs use the same crude helper. Layoutmaster receives one assembly token and solves the text around that current field. No browser wrap is involved, and no hidden collision layer is painted over the result.

That makes this model useful for playful interfaces, animated reading surfaces, game-like editorial tools, diagrams, mascots, and fast prototypes. The authored shape can be rough. What matters is that the text negotiates with the real primitive assembly the app provided for this frame.

Drag the figure anywhere, or hide the drawing and leave only the spatial field behind. The figure is just data, so every pose is ordinary JavaScript plus a fresh form call.`;

const INITIAL_X = 118;
const INITIAL_Y = 108;
const INITIAL_WAVE = -20;

let bodyX = INITIAL_X;
let bodyY = INITIAL_Y;
let frameRequested = false;
let animationId = 0;
let dragState = null;
let startTime = performance.now();

function limb(anchorX, anchorY, length, angleDeg, thickness) {
  return {
    kind: "capsule",
    x: anchorX,
    y: anchorY,
    length,
    angle: angleDeg,
    thickness
  };
}

function getPose() {
  const surfaceWidth = getSurfaceWidth();
  bodyX = clampBodyX(bodyX, surfaceWidth);
  bodyY = clampBodyY(bodyY);
  const manualWave = Number(waveInput.value);
  const t = (performance.now() - startTime) / 1000;
  const wave = playInput.checked
    ? -22 + Math.sin(t * 4.2) * 48
    : manualWave;
  const counterWave = playInput.checked
    ? 200 + Math.sin(t * 2.8 + 1.1) * 24
    : 202;
  if (playInput.checked) {
    waveInput.value = String(Math.round(wave));
  }
  return { bodyX, bodyY, wave, counterWave };
}

function getSurfaceWidth() {
  const ownWidth = surface.getBoundingClientRect().width;
  const available = ownWidth || surface.parentElement?.clientWidth || MAX_SURFACE_WIDTH;
  return Math.min(MAX_SURFACE_WIDTH, Math.max(320, Math.floor(available)));
}

function clampBodyX(value, surfaceWidth = getSurfaceWidth()) {
  return Math.min(Math.max(Number(value), 20), Math.max(20, surfaceWidth - 192));
}

function clampBodyY(value) {
  const surfaceHeight = Math.max(MIN_SURFACE_HEIGHT, surface.getBoundingClientRect().height || MIN_SURFACE_HEIGHT);
  return Math.min(Math.max(Number(value), 20), Math.max(20, surfaceHeight - 208));
}

// -- Layoutmaster: Author primitive parts for the assembly --
// Parts are plain geometry descriptors. Capsule is authoring sugar; the public
// builder lowers it into polygon geometry before the engine sees the assembly.
function buildStickManParts(wave, counterWave) {
  return [
    { kind: "circle", x: 54, y: 0, radius: 19 },
    { kind: "rect", x: 68, y: 38, width: 10, height: 64 },
    limb(73, 50, 58, counterWave, 10),
    limb(73, 50, 66, wave, 10),  // waving arm — angle changes each frame
    limb(73, 100, 68, 118, 11),
    limb(73, 100, 68, 62, 11)
  ];
}

// -- Layoutmaster: Build exclusion assembly from parts --
// assembly() wraps the part list into one opaque spatial token anchored at
// (x, y). Changing the pose means calling assembly() again with new coords —
// the gap expands each part outward so text never crowds the figure.
function buildAssembly() {
  const pose = getPose();
  const parts = buildStickManParts(pose.wave, pose.counterWave);
  return {
    pose,
    parts,
    assembly: exclusion.assembly({
      x: pose.bodyX,        // top-left origin; all part coords are relative to this
      y: pose.bodyY,
      width: 172,
      height: 188,
      parts,
      gap: 5                // outward padding applied to every part's boundary
    })
  };
}

// -- Layoutmaster: Render result.pieces --
// Each piece carries final x/y geometry and its text slice — already broken
// and positioned around the assembly token. Render exactly what came back;
// no browser reflow, no second set of collision rules.
function renderPieceSet(result) {
  for (const piece of result.pieces) {
    if (showPiecesInput.checked) {
      helpers.renderPieceChrome(surface, piece, { baseline: true });
    }
    helpers.renderPiece(surface, piece);
  }
}

function svg(tagName) {
  return document.createElementNS(SVG_NS, tagName);
}

function drawRig(parts, originX, originY) {
  const surfaceWidth = getSurfaceWidth();
  const layer = svg("svg");
  layer.classList.add("rig-layer");
  layer.setAttribute("viewBox", `0 0 ${surfaceWidth} ${surface.clientHeight || MIN_SURFACE_HEIGHT}`);
  surface.append(layer);

  const hitbox = svg("rect");
  hitbox.classList.add("rig-hitbox");
  hitbox.setAttribute("x", String(originX));
  hitbox.setAttribute("y", String(originY));
  hitbox.setAttribute("width", "172");
  hitbox.setAttribute("height", "188");
  hitbox.dataset.rig = "stick-man";
  if (dragState) hitbox.classList.add("dragging");
  layer.append(hitbox);

  if (!showVisualInput.checked) {
    return;
  }

  for (const part of parts) {
    const node = part.kind === "circle"
      ? svg("ellipse")
      : part.kind === "rect"
        ? svg("rect")
        : (part.kind === "capsule" || part.kind === "line")
          ? svg("line")
          : svg("polygon");
    node.classList.add("rig-part");
    if (part.kind === "circle") {
      const radius = Number(part.radius);
      node.setAttribute("cx", String(originX + part.x + radius));
      node.setAttribute("cy", String(originY + part.y + radius));
      node.setAttribute("rx", String(radius));
      node.setAttribute("ry", String(radius));
    } else if (part.kind === "rect") {
      node.setAttribute("x", String(originX + part.x));
      node.setAttribute("y", String(originY + part.y));
      node.setAttribute("width", String(part.width));
      node.setAttribute("height", String(part.height));
    } else if (part.kind === "capsule" || part.kind === "line") {
      const radians = Number(part.angle || 0) * Math.PI / 180;
      const x2 = Number(part.x) + Math.cos(radians) * Number(part.length || 0);
      const y2 = Number(part.y) + Math.sin(radians) * Number(part.length || 0);
      const thickness = Number(part.thickness || part.strokeWidth || part.width || part.w || 1);
      node.setAttribute("x1", String(originX + Number(part.x || 0)));
      node.setAttribute("y1", String(originY + Number(part.y || 0)));
      node.setAttribute("x2", String(originX + x2));
      node.setAttribute("y2", String(originY + y2));
      node.setAttribute("stroke-linecap", "round");
      node.style.strokeWidth = `${Number.isFinite(thickness) ? Math.max(1, thickness) : 1}px`;
    } else {
      node.setAttribute("points", part.points.map(([x, y]) => `${originX + x},${originY + y}`).join(" "));
    }
    layer.append(node);
  }

  for (const [x, y] of [[73, 50], [73, 100]]) {
    const joint = svg("circle");
    joint.classList.add("rig-joint");
    joint.setAttribute("cx", String(originX + x));
    joint.setAttribute("cy", String(originY + y));
    joint.setAttribute("r", "4");
    layer.append(joint);
  }
}

function render() {
  frameRequested = false;
  surface.replaceChildren();
  surface.style.width = "";
  const surfaceWidth = getSurfaceWidth();
  surface.style.width = `${surfaceWidth}px`;

  try {
    const rig = buildAssembly();
    // -- Layoutmaster: form with the assembly as a spatial exclusion --
    // The assembly token drops into `exclusions` identically to a circle or
    // polygon. The engine negotiates all field types in one unified pass.
    const result = form(TEXT, {
      width: surfaceWidth,
      fontFamily: FONT_FAMILY,
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      exclusions: [rig.assembly]
    });
    const surfaceHeight = Math.max(MIN_SURFACE_HEIGHT, result.height + 36);
    surface.style.height = `${surfaceHeight}px`;
    renderPieceSet(result);
    drawRig(rig.parts, rig.pose.bodyX, rig.pose.bodyY);
    status.className = "status";
    status.textContent = `${rig.assembly.parts.count} primitive parts | x ${Math.round(rig.pose.bodyX)}, y ${Math.round(rig.pose.bodyY)} | wave ${Math.round(rig.pose.wave)}° | layout ${result.performance.layoutMs.toFixed(2)} ms`;
  } catch (error) {
    console.error(error);
    surface.style.height = `${MIN_SURFACE_HEIGHT}px`;
    status.className = "status error";
    status.textContent = error instanceof Error ? error.message : String(error);
  }
}

function scheduleRender() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(render);
}

function tick() {
  if (playInput.checked) {
    scheduleRender();
  }
  animationId = requestAnimationFrame(tick);
}

function resetRig() {
  bodyX = INITIAL_X;
  bodyY = INITIAL_Y;
  waveInput.value = String(INITIAL_WAVE);
  startTime = performance.now();
  scheduleRender();
}

function beginDrag(event) {
  const target = event.target instanceof SVGElement ? event.target : null;
  if (!target?.classList.contains("rig-hitbox")) return;
  const surfaceRect = surface.getBoundingClientRect();
  dragState = {
    offsetX: event.clientX - surfaceRect.left - bodyX,
    offsetY: event.clientY - surfaceRect.top - bodyY,
    pointerId: event.pointerId
  };
  target.classList.add("dragging");
  surface.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function updateDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const surfaceRect = surface.getBoundingClientRect();
  bodyX = clampBodyX(event.clientX - surfaceRect.left - dragState.offsetX);
  bodyY = clampBodyY(event.clientY - surfaceRect.top - dragState.offsetY);
  scheduleRender();
}

function endDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (surface.hasPointerCapture?.(event.pointerId)) {
    surface.releasePointerCapture(event.pointerId);
  }
  dragState = null;
  scheduleRender();
}

waveInput.addEventListener("input", () => {
  playInput.checked = false;
  scheduleRender();
});
playInput.addEventListener("change", () => {
  startTime = performance.now();
  scheduleRender();
});
showVisualInput.addEventListener("change", scheduleRender);
showPiecesInput.addEventListener("change", scheduleRender);
resetButton.addEventListener("click", resetRig);
surface.addEventListener("pointerdown", beginDrag);
surface.addEventListener("pointermove", updateDrag);
surface.addEventListener("pointerup", endDrag);
surface.addEventListener("pointercancel", endDrag);
window.addEventListener("resize", scheduleRender);

render();
animationId = requestAnimationFrame(tick);
window.addEventListener("pagehide", () => cancelAnimationFrame(animationId));

// -- Layoutmaster API --
// `exclusion` builds opaque spatial field tokens; `form` runs the layout
// engine with those fields as first-class obstacles.
import { exclusion, form } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";

const surface = document.getElementById("surface");
const showPiecesInput = document.getElementById("show-pieces-input");
const resetButton = document.getElementById("reset-button");
const status = document.getElementById("status");

const SURFACE_WIDTH = 900;
const MIN_SURFACE_HEIGHT = 720;
const FONT_FAMILY = '"Times New Roman", Times, serif';
const FONT_SIZE = 20;
const LINE_HEIGHT = 1.42;

const DEMO_TEXT = `The form API does not need a special frontend exclusion system. It only needs the same authored fields passed back in as part of the form request. That means the browser can move obstacles around in plain JavaScript and immediately ask for a fresh packing result.

This demo keeps the passage fixed so the only variable is the spatial field. Drag the circle into the opening paragraph, move the square across the center, or sweep the polygon through the lower bands. The returned pieces should reflow in real time because the exclusions are part of the form call itself, not an afterthought layered on top of it.

The point is not decorative wrapping. The point is that a developer can treat these as ordinary movable objects, hand the current field state to form, and render the exact pieces that come back. The page remains honest: no fake browser text rewrap, no hidden layout engine in the demo, and no second set of collision rules in the UI.

If this feels responsive, then layoutmaster already has the right surface for interactive editorial tools, playful frontend layouts, and live authoring systems that want rigid text fragments plus real spatial negotiation.`;

const SHAPES = {
  circle: {
    label: "Circle",
    className: "circle",
    color: "rgba(102, 146, 227, 0.18)",
    size: 172
  },
  rect: {
    label: "Square",
    className: "rect",
    color: "rgba(214, 164, 82, 0.2)",
    size: 152
  },
  polygon: {
    label: "Polygon",
    className: "polygon",
    color: "rgba(106, 168, 120, 0.18)",
    width: 186,
    height: 176,
    points: [
      [26, 0],
      [186, 22],
      [152, 94],
      [186, 176],
      [44, 154],
      [0, 76]
    ]
  }
};

const INITIAL_STATE = {
  circle: { x: 176, y: 96 },
  rect: { x: 624, y: 244 },
  polygon: { x: 228, y: 454 }
};

let fieldState = structuredClone(INITIAL_STATE);
let dragState = null;
let frameRequested = false;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clearSurface() {
  surface.replaceChildren();
}

function getPolygonClipPath(points, width, height) {
  const scaleX = width > 0 ? 100 / width : 0;
  const scaleY = height > 0 ? 100 / height : 0;
  return `polygon(${points.map(([x, y]) => `${(x * scaleX).toFixed(3)}% ${(y * scaleY).toFixed(3)}%`).join(", ")})`;
}

// -- Layoutmaster: Author exclusion fields --
// Each factory returns an opaque token - pure authored geometry with no layout
// logic embedded. Tokens are passed to form() as part of the request; the
// engine handles collision and text reflow in one unified pass.
function createExclusions() {
  return [
    exclusion.circle({         // circular obstacle; x/y = top-left of bounding box
      x: fieldState.circle.x,
      y: fieldState.circle.y,
      radius: SHAPES.circle.size / 2
    }),
    exclusion.rect({           // rectangular obstacle
      x: fieldState.rect.x,
      y: fieldState.rect.y,
      width: SHAPES.rect.size,
      height: SHAPES.rect.size
    }),
    exclusion.polygon({        // arbitrary polygon; x/y offsets the point set as a group
      x: fieldState.polygon.x,
      y: fieldState.polygon.y,
      points: SHAPES.polygon.points
    })
  ];
}

function computeFieldBounds(kind) {
  if (kind === "circle") {
    return { width: SHAPES.circle.size, height: SHAPES.circle.size };
  }
  if (kind === "rect") {
    return { width: SHAPES.rect.size, height: SHAPES.rect.size };
  }
  return { width: SHAPES.polygon.width, height: SHAPES.polygon.height };
}

// -- Layoutmaster: Render result.pieces --
// Each piece carries pre-computed geometry (x, y, width, height) and its text
// slice - already broken and positioned around the exclusion fields. No browser
// reflow, no second set of collision rules: render exactly what came back.
function renderResultPieces(result) {
  for (const piece of result.pieces) {
    if (showPiecesInput.checked) {
      helpers.renderPieceChrome(surface, piece, { baseline: true });
    }
    helpers.renderPiece(surface, piece);
  }
}

function buildFieldNode(kind) {
  const definition = SHAPES[kind];
  const { width, height } = computeFieldBounds(kind);
  const node = document.createElement("div");
  node.className = `field ${definition.className}`;
  node.dataset.kind = kind;
  node.style.left = `${fieldState[kind].x}px`;
  node.style.top = `${fieldState[kind].y}px`;
  node.style.width = `${width}px`;
  node.style.height = `${height}px`;
  if (kind === "polygon") {
    node.style.clipPath = getPolygonClipPath(definition.points, definition.width, definition.height);
  }
  return node;
}

function renderFields() {
  surface.appendChild(buildFieldNode("circle"));
  surface.appendChild(buildFieldNode("rect"));
  surface.appendChild(buildFieldNode("polygon"));
}

function renderForm() {
  frameRequested = false;
  clearSurface();
  surface.style.width = `${SURFACE_WIDTH}px`;

  try {
    // -- Layoutmaster: form with exclusions --
    // Exclusions travel inside the form request, not as a post-process step.
    // The engine negotiates spatial fields and text placement in one pass.
    const exclusions = createExclusions();
    const result = form(DEMO_TEXT, {
      width: SURFACE_WIDTH,
      fontFamily: FONT_FAMILY,
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      exclusions
    });

    const lowestFieldBottom = Math.max(
      fieldState.circle.y + SHAPES.circle.size,
      fieldState.rect.y + SHAPES.rect.size,
      fieldState.polygon.y + SHAPES.polygon.height
    );
    const formHeight = Math.max(MIN_SURFACE_HEIGHT, result.height + 32, lowestFieldBottom + 32);
    surface.style.height = `${formHeight}px`;

    renderResultPieces(result);
    renderFields();

    status.className = "status";
    status.textContent = `${result.pieces.length} pieces | ${result.height.toFixed(1)} px height | layout ${result.performance.layoutMs.toFixed(2)} ms | collider ${result.performance.colliderFieldQueryCalls} queries`;
  } catch (error) {
    console.error(error);
    status.className = "status error";
    status.textContent = error instanceof Error ? error.message : String(error);
    surface.style.height = `${MIN_SURFACE_HEIGHT}px`;
    renderFields();
  }
}

function scheduleRender() {
  if (frameRequested) {
    return;
  }
  frameRequested = true;
  requestAnimationFrame(() => {
    renderForm();
  });
}

function beginDrag(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest(".field") : null;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const kind = target.dataset.kind;
  if (!kind || !fieldState[kind]) {
    return;
  }

  const surfaceRect = surface.getBoundingClientRect();
  dragState = {
    kind,
    offsetX: event.clientX - surfaceRect.left - fieldState[kind].x,
    offsetY: event.clientY - surfaceRect.top - fieldState[kind].y,
    pointerId: event.pointerId
  };
  target.classList.add("dragging");
  surface.setPointerCapture(event.pointerId);
}

function updateDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  const surfaceRect = surface.getBoundingClientRect();
  const { width, height } = computeFieldBounds(dragState.kind);
  const maxX = Math.max(0, surfaceRect.width - width);
  const maxY = Math.max(0, surfaceRect.height - height);
  fieldState[dragState.kind] = {
    x: clamp(event.clientX - surfaceRect.left - dragState.offsetX, 0, maxX),
    y: clamp(event.clientY - surfaceRect.top - dragState.offsetY, 0, maxY)
  };
  // Exclusions are plain data - updating state and calling form() is the
  // entire re-layout path. No special incremental update API required.
  scheduleRender();
}

function endDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  if (surface.hasPointerCapture?.(event.pointerId)) {
    surface.releasePointerCapture(event.pointerId);
  }
  const active = surface.querySelector(`.field[data-kind="${dragState.kind}"]`);
  if (active instanceof HTMLElement) {
    active.classList.remove("dragging");
  }
  dragState = null;
}

function resetPositions() {
  fieldState = structuredClone(INITIAL_STATE);
  renderForm();
}

surface.addEventListener("pointerdown", beginDrag);
surface.addEventListener("pointermove", updateDrag);
surface.addEventListener("pointerup", endDrag);
surface.addEventListener("pointercancel", endDrag);
showPiecesInput.addEventListener("change", renderForm);
resetButton.addEventListener("click", resetPositions);

renderForm();

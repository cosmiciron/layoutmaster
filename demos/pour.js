// -- Layoutmaster API --
// `pour` fits as much text as possible into one exclusion shape and reports
// both the consumed slice and the remaining text.
import { exclusion, pour } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";
import { prepareBrowserFonts } from "./helpers/prepare-browser-fonts.js";

const shapeInput = document.getElementById("shape-input");
const fontFamilyInput = document.getElementById("font-family-input");
const fontSizeInput = document.getElementById("font-size-input");
const lineHeightInput = document.getElementById("line-height-input");
const hyphenationInput = document.getElementById("hyphenation-input");
const textInput = document.getElementById("text-input");
const showPiecesInput = document.getElementById("show-pieces-input");
const showShapeInput = document.getElementById("show-shape-input");
const perfStatus = document.getElementById("perf-status");
const shapeHost = document.getElementById("shape-host");

const POLYGON_POINTS = [
  [48, 0],
  [420, 36],
  [356, 200],
  [420, 400],
  [84, 360],
  [0, 172]
];

const SHAPES = {
  circle: {
    id: "circle",
    label: "Circle",
    className: "circle",
    width: 420,
    height: 420,
    createShape() {
      return exclusion.circle({ x: 0, y: 0, radius: 210 });
    }
  },
  oval: {
    id: "oval",
    label: "Oval",
    className: "oval",
    width: 420,
    height: 320,
    createShape() {
      return exclusion.ellipse({ x: 0, y: 0, width: 420, height: 320 });
    }
  },
  square: {
    id: "square",
    label: "Square",
    className: "square",
    width: 420,
    height: 420,
    createShape() {
      return exclusion.rect({ x: 0, y: 0, width: 420, height: 420 });
    }
  },
  polygon: {
    id: "polygon",
    label: "Polygon",
    className: "polygon",
    width: 420,
    height: 400,
    createShape() {
      return exclusion.polygon({ x: 0, y: 0, points: POLYGON_POINTS });
    }
  }
};

function getCurrentInputs() {
  return {
    selectedShape: shapeInput.value,
    fontFamily: fontFamilyInput.value || '"Times New Roman", Times, serif',
    fontSize: Number(fontSizeInput.value) || 18,
    lineHeight: Number(lineHeightInput.value) || 1.4,
    hyphenation: hyphenationInput.value || "off",
    sourceText: textInput.value,
    showPieces: showPiecesInput.checked,
    showShape: showShapeInput.checked
  };
}

function getPolygonClipPath(points, width, height) {
  const scaleX = width > 0 ? 100 / width : 0;
  const scaleY = height > 0 ? 100 / height : 0;
  return `polygon(${points.map(([x, y]) => `${(x * scaleX).toFixed(3)}% ${(y * scaleY).toFixed(3)}%`).join(", ")})`;
}

// -- Layoutmaster: Build a pourable shape and text options --
// The shape comes from the exclusion namespace. `pour()` then combines that
// authored shape with the text styling options below.
function buildPourOptions(fontFamily, fontSize, lineHeight, hyphenation) {
  return {
    fontFamily,
    fontSize,
    lineHeight,
    hyphenation
  };
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} ms` : "-";
}

function updatePerfStatus(message, isError = false) {
  perfStatus.className = isError ? "perf-note error" : "perf-note";
  perfStatus.textContent = message;
}

function renderShapeCard(shape, result, fontFamily, fontSize, lineHeight, showPieces, showShape) {
  const contentReport = result.content;
  const card = document.createElement("section");
  card.className = "shape-card";
  card.style.width = `${Math.min(920, shape.width + 360 + 16)}px`;

  const shapeColumn = document.createElement("div");
  shapeColumn.className = "shape-column";

  const header = document.createElement("div");
  header.className = "shape-header";
  const title = document.createElement("div");
  title.textContent = shape.label;
  header.appendChild(title);

  const meta = document.createElement("div");
  const usedHeight = result.height;
  meta.textContent = `${contentReport.consumed.length} chars | ${result.pieces.length} piece(s) | used ${usedHeight.toFixed(1)}px | outside ${contentReport.remaining.length}`;
  header.appendChild(meta);
  shapeColumn.appendChild(header);

  const region = document.createElement("div");
  region.className = `shape ${shape.className}`;
  region.style.width = `${shape.width}px`;
  region.style.height = `${shape.height}px`;

  const fill = document.createElement("div");
  fill.className = "shape-fill";
  fill.style.display = showShape ? "block" : "none";
  region.appendChild(fill);

  const content = document.createElement("div");
  content.className = "shape-content";
  region.appendChild(content);

  const outline = document.createElement("div");
  outline.className = "shape-outline";
  outline.style.display = showShape ? "block" : "none";
  let clipPath = "";
  if (shape.id === "polygon") {
    clipPath = getPolygonClipPath(POLYGON_POINTS, shape.width, shape.height);
    fill.style.clipPath = clipPath;
    outline.style.clipPath = clipPath;
  }
  region.appendChild(outline);

  // -- Layoutmaster: Render result.pieces --
  // Same placement contract as the other demos: absolute x/y, width/height,
  // and the text slice that landed in each positioned piece.
  for (const piece of result.pieces) {
    if (showPieces) {
      helpers.renderPieceChrome(content, piece, { baseline: true });
    }
    helpers.renderPiece(content, piece);
  }

  shapeColumn.appendChild(region);

  const statusPanel = document.createElement("aside");
  statusPanel.className = "status-panel";

  const statusTitle = document.createElement("h2");
  statusTitle.className = "status-title";
  statusTitle.textContent = "Pour Status";

  const statusSummary = document.createElement("div");
  statusSummary.className = "status-summary";
  statusSummary.textContent = contentReport.complete
    ? "The selected shape consumed the whole passage."
    : "The selected shape consumed part of the passage and left a remainder.";

  const statusGrid = document.createElement("div");
  statusGrid.className = "status-grid";

  const stats = [
    ["Consumed", String(contentReport.consumed.length)],
    ["Remaining", String(contentReport.remaining.length)],
    ["Complete", contentReport.complete ? "Yes" : "No"]
  ];
  for (const [label, value] of stats) {
    const stat = document.createElement("div");
    stat.className = "status-stat";
    const statLabel = document.createElement("div");
    statLabel.className = "status-stat-label";
    statLabel.textContent = label;
    const statValue = document.createElement("div");
    statValue.className = "status-stat-value";
    statValue.textContent = value;
    stat.append(statLabel, statValue);
    statusGrid.appendChild(stat);
  }

  const consumedBlock = document.createElement("div");
  consumedBlock.className = "status-block";
  const consumedLabel = document.createElement("div");
  consumedLabel.className = "status-block-label";
  consumedLabel.textContent = "Consumed Text";
  const consumedValue = document.createElement("div");
  consumedValue.className = "status-block-value";
  consumedValue.textContent = contentReport.consumed.text || "(empty)";
  consumedBlock.append(consumedLabel, consumedValue);

  const remainingBlock = document.createElement("div");
  remainingBlock.className = "status-block";
  const remainingLabel = document.createElement("div");
  remainingLabel.className = "status-block-label";
  remainingLabel.textContent = "Remaining Text";
  const remainingValue = document.createElement("div");
  remainingValue.className = "status-block-value";
  remainingValue.textContent = contentReport.remaining.text || "(empty)";
  remainingBlock.append(remainingLabel, remainingValue);

  statusPanel.append(statusTitle, statusSummary, statusGrid, consumedBlock, remainingBlock);
  card.append(shapeColumn, statusPanel);
  return card;
}

function showPourError(message) {
  shapeHost.replaceChildren();
  const error = document.createElement("div");
  error.textContent = `Pour failed: ${message}`;
  shapeHost.appendChild(error);
}

let runToken = 0;

async function runPour() {
  const token = ++runToken;
  shapeHost.replaceChildren();
  updatePerfStatus("Preparing fonts...");

  try {
    const { selectedShape, fontFamily, fontSize, lineHeight, hyphenation, sourceText, showPieces, showShape } = getCurrentInputs();
    const shape = SHAPES[selectedShape] || SHAPES.circle;
    const pourOptions = buildPourOptions(fontFamily, fontSize, lineHeight, hyphenation);
    // Demo helper: this DOMless control panel must ask the browser to resolve
    // the selected font before taking a synchronous Layoutmaster measurement.
    await prepareBrowserFonts({ fontFamily, fontSize, text: sourceText });
    if (token !== runToken) return;
    updatePerfStatus("Pouring...");
    // -- Layoutmaster: Pour --
    // One call pours into a single exclusion shape. The result reports the
    // positioned pieces, how much text fit, and any remaining overflow.
    const result = pour(sourceText, shape.createShape(), pourOptions);
    const renderStartedAt = performance.now();
    const card = renderShapeCard(shape, result, fontFamily, fontSize, lineHeight, showPieces, showShape);
    shapeHost.appendChild(card);
    const renderMs = performance.now() - renderStartedAt;
    const layoutMs = result.performance?.layoutMs;
    const wrapMs = result.performance?.wrapStreamMs;
    updatePerfStatus(`Layout ${formatMs(layoutMs)} | Wrap ${formatMs(wrapMs)} | Render ${formatMs(renderMs)}`);
  } catch (error) {
    console.error(error);
    updatePerfStatus(error instanceof Error ? error.message : String(error), true);
    showPourError(error instanceof Error ? error.message : String(error));
  }
}

showPiecesInput.addEventListener("change", runPour);
showShapeInput.addEventListener("change", runPour);
shapeInput.addEventListener("change", runPour);
fontFamilyInput.addEventListener("change", runPour);
fontSizeInput.addEventListener("input", runPour);
lineHeightInput.addEventListener("input", runPour);
hyphenationInput.addEventListener("change", runPour);
textInput.addEventListener("input", runPour);

runPour();

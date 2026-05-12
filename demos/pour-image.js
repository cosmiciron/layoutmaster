// -- Layoutmaster API --
// `helpers.imageToExclusion` turns PNG alpha into an assembly token; `pour` then
// uses that token as a real container interior instead of an outside obstacle.
import { pour } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";
import { prepareBrowserFonts } from "./helpers/prepare-browser-fonts.js";

const fileInput = document.getElementById("file-input");
const scaleInput = document.getElementById("scale-input");
const scaleMeta = document.getElementById("scale-meta");
const fontFamilyInput = document.getElementById("font-family-input");
const fontSizeInput = document.getElementById("font-size-input");
const textInput = document.getElementById("text-input");
const imageToggle = document.getElementById("image-toggle");
const status = document.getElementById("status");
const consumedCountOutput = document.getElementById("consumed-length");
const remainingLengthOutput = document.getElementById("remaining-length");
const consumedOutput = document.getElementById("consumed-text");
const remainingOutput = document.getElementById("remaining-text");
const perf = document.getElementById("perf");
const stage = document.getElementById("stage");

const STAGE_WIDTH = 920;
const MIN_STAGE_HEIGHT = 620;
const STAGE_PADDING = 44;
const LINE_HEIGHT = 1.42;
const BAND_HEIGHT = 1;
const TIERS = 1;
const GAP = 0;
const DEFAULT_TEXT = textInput.value.trim();

let currentUrl = null;
let prevObjectUrl = null;
let naturalWidth = 0;
let naturalHeight = 0;
let renderToken = 0;
let lastPoured = null;
let autoPourFrame = null;
let cachedAssembly = null;
let cachedAssemblyKey = "";

function setStatus(message, isError = false) {
  status.className = isError ? "status error" : "status";
  status.textContent = message;
}

function getText() {
  return textInput.value.trim() || DEFAULT_TEXT;
}

function getFontFamily() {
  return fontFamilyInput.value || '"Times New Roman", Times, serif';
}

function getFontSize() {
  return Number(fontSizeInput.value) || 18;
}

function getScaleRatio() {
  return (parseFloat(scaleInput.value) || 100) / 100;
}

function getScaledSize() {
  const ratio = getScaleRatio();
  return {
    width: Math.max(1, Math.round(naturalWidth * ratio)),
    height: Math.max(1, Math.round(naturalHeight * ratio))
  };
}

function getStageMetrics() {
  const size = getScaledSize();
  const height = Math.max(MIN_STAGE_HEIGHT, size.height + STAGE_PADDING * 2);
  return {
    ...size,
    stageHeight: height,
    x: Math.round((STAGE_WIDTH - size.width) / 2),
    y: Math.round((height - size.height) / 2)
  };
}

function updateScaleMeta() {
  if (!naturalWidth || !naturalHeight) {
    scaleMeta.textContent = `${scaleInput.value}% scale`;
    return;
  }
  const { width, height } = getScaledSize();
  scaleMeta.textContent = `${scaleInput.value}% scale - ${width} x ${height}px`;
}

function clearStage(height = MIN_STAGE_HEIGHT) {
  stage.style.width = `${STAGE_WIDTH}px`;
  stage.style.height = `${height}px`;
  stage.replaceChildren();
}

function renderImageLayer(metrics, mode) {
  if (!currentUrl) {
    return;
  }
  const layer = document.createElement("div");
  layer.className = mode === "faded" ? "image-layer faded" : "image-layer";
  layer.style.left = `${metrics.x}px`;
  layer.style.top = `${metrics.y}px`;
  layer.style.width = `${metrics.width}px`;
  layer.style.height = `${metrics.height}px`;

  const image = document.createElement("img");
  image.src = currentUrl;
  layer.appendChild(image);
  stage.appendChild(layer);
}

function renderStagePieces(pieces, offsetX = 0, offsetY = 0) {
  const layer = document.createElement("div");
  layer.className = "piece-layer";
  layer.style.position = "absolute";
  layer.style.left = `${offsetX}px`;
  layer.style.top = `${offsetY}px`;
  layer.style.width = "0";
  layer.style.height = "0";
  stage.appendChild(layer);
  for (const piece of pieces) {
    helpers.renderPiece(layer, piece);
  }
}

function resetStatusOutputs() {
  consumedCountOutput.textContent = "-";
  remainingLengthOutput.textContent = "-";
  consumedOutput.textContent = "(none yet)";
  remainingOutput.textContent = "(none yet)";
  perf.textContent = "";
}

function updateResultStatus(result) {
  const content = result.content;
  consumedCountOutput.textContent = String(content.consumed.length);
  remainingLengthOutput.textContent = String(content.remaining.length);
  consumedOutput.textContent = content.consumed.text || "(empty)";
  remainingOutput.textContent = content.remaining.text || "(empty)";
  const p = result.performance;
  perf.textContent =
    `${result.pieces.length} pieces\n` +
    `layout ${p.layoutMs.toFixed(2)} ms\n` +
    `wrap   ${p.wrapStreamMs.toFixed(2)} ms`;
}

function renderPreview() {
  if (!currentUrl || !naturalWidth || !naturalHeight) {
    clearStage();
    setStatus("Load a PNG to begin.");
    resetStatusOutputs();
    return;
  }

  const metrics = getStageMetrics();
  clearStage(metrics.stageHeight);
  if (imageToggle.checked) {
    renderImageLayer(metrics, "preview");
  }
  resetStatusOutputs();
  setStatus("Image ready. Pouring starts automatically after the image loads.");
}

function renderPouredState() {
  if (!lastPoured) {
    renderPreview();
    return;
  }

  const { metrics, result } = lastPoured;
  const showImage = imageToggle.checked;
  clearStage(Math.max(metrics.stageHeight, result.height + metrics.y + STAGE_PADDING, metrics.y + metrics.height + STAGE_PADDING));

  if (showImage) {
    renderImageLayer(metrics, "faded");
  }

  renderStagePieces(result.pieces, metrics.x, metrics.y);
  updateResultStatus(result);
  setStatus(showImage
    ? "Text poured into the silhouette. The source image is faded behind the returned pieces."
    : "Text poured into the silhouette. The image layer is hidden.");
}

function getAssemblyCacheKey(metrics) {
  return [currentUrl, metrics.width, metrics.height, BAND_HEIGHT, TIERS, GAP].join("|");
}

async function getAssembly(metrics) {
  const cacheKey = getAssemblyCacheKey(metrics);
  if (cachedAssembly && cachedAssemblyKey === cacheKey) {
    return cachedAssembly;
  }

  const assembly = await helpers.imageToExclusion(currentUrl, {
    x: 0,
    y: 0,
    width: metrics.width,
    height: metrics.height,
    bandHeight: BAND_HEIGHT,
    tiers: TIERS,
    gap: GAP
  });
  cachedAssembly = assembly;
  cachedAssemblyKey = cacheKey;
  return assembly;
}

// -- Layoutmaster: Extract image silhouette and pour into it --
// The PNG alpha becomes a container. The extracted assembly and the image layer
// share the same centered box, so the readable silhouette stays aligned.
async function runPour() {
  const token = ++renderToken;

  if (!currentUrl || !naturalWidth || !naturalHeight) {
    renderPreview();
    return;
  }

  const metrics = getStageMetrics();
  clearStage(metrics.stageHeight);
  setStatus("Extracting and pouring...");
  resetStatusOutputs();

  try {
    const assembly = await getAssembly(metrics);

    if (token !== renderToken) {
      return;
    }

    setStatus("Preparing fonts...");
    // Demo helper: this DOMless control panel must ask the browser to resolve
    // the selected font before taking a synchronous Layoutmaster measurement.
    await prepareBrowserFonts({
      fontFamily: getFontFamily(),
      fontSize: getFontSize(),
      text: getText()
    });

    if (token !== renderToken) {
      return;
    }

    // -- Layoutmaster: Pour into the extracted assembly --
    // The returned result carries both the visible fragments and the consumed
    // vs remaining text split, which we surface in the status panel.
    const result = pour(getText(), assembly, {
      fontFamily: getFontFamily(),
      fontSize: getFontSize(),
      lineHeight: LINE_HEIGHT
    });

    if (token !== renderToken) {
      return;
    }

    lastPoured = { metrics, result };
    renderPouredState();
  } catch (error) {
    if (token !== renderToken) {
      return;
    }
    console.error(error);
    clearStage(metrics.stageHeight);
    resetStatusOutputs();
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function invalidatePour() {
  lastPoured = null;
  cachedAssembly = null;
  cachedAssemblyKey = "";
}

function scheduleAutoPour() {
  if (!currentUrl || !naturalWidth || !naturalHeight) {
    return;
  }
  if (autoPourFrame !== null) {
    cancelAnimationFrame(autoPourFrame);
  }
  autoPourFrame = window.requestAnimationFrame(() => {
    autoPourFrame = null;
    runPour();
  });
}

function handleLoadedImage(url) {
  const image = new Image();
  image.onload = () => {
    naturalWidth = image.naturalWidth;
    naturalHeight = image.naturalHeight;
    updateScaleMeta();
    invalidatePour();
    scheduleAutoPour();
  };
  image.onerror = () => {
    setStatus("Image load failed.", true);
  };
  image.src = url;
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }
  if (prevObjectUrl) {
    URL.revokeObjectURL(prevObjectUrl);
  }
  currentUrl = URL.createObjectURL(file);
  prevObjectUrl = currentUrl;
  setStatus("Image loaded.");
  handleLoadedImage(currentUrl);
});

scaleInput.addEventListener("input", () => {
  updateScaleMeta();
  if (!currentUrl) {
    return;
  }
  invalidatePour();
  scheduleAutoPour();
});

textInput.addEventListener("input", () => {
  if (!currentUrl) {
    return;
  }
  lastPoured = null;
  scheduleAutoPour();
});

fontFamilyInput.addEventListener("change", () => {
  if (!currentUrl) {
    return;
  }
  lastPoured = null;
  scheduleAutoPour();
});

fontSizeInput.addEventListener("input", () => {
  if (!currentUrl) {
    return;
  }
  lastPoured = null;
  scheduleAutoPour();
});

imageToggle.addEventListener("change", () => {
  if (lastPoured) {
    renderPouredState();
  } else if (currentUrl) {
    renderPreview();
  }
});

updateScaleMeta();
renderPreview();

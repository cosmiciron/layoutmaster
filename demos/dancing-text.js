// -- Layoutmaster API --
// The video pipeline now lives in a demo utility. This file keeps the live
// `form()` / `pour()` interaction loop and repositions cached assemblies per
// frame so the UI code stays focused on playback and rendering.
import { exclusion, form, pour } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";
import { prepareBrowserFonts } from "./helpers/prepare-browser-fonts.js";

const videoInput = document.getElementById("video-input");
const buildButton = document.getElementById("build-button");
const playButton = document.getElementById("play-button");
const smoothnessInput = document.getElementById("smoothness-input");
const smoothnessValue = document.getElementById("smoothness-value");
const figureSizeInput = document.getElementById("figure-size-input");
const figureSizeValue = document.getElementById("figure-size-value");
const formModeInput = document.getElementById("form-mode-input");
const pourModeInput = document.getElementById("pour-mode-input");
const fontFamilyInput = document.getElementById("font-family-input");
const fontSizeInput = document.getElementById("font-size-input");
const textInput = document.getElementById("text-input");
const status = document.getElementById("status");
const progress = document.getElementById("progress");
const progressLabel = document.getElementById("progress-label");
const progressPercent = document.getElementById("progress-percent");
const progressFill = document.getElementById("progress-fill");
const perf = document.getElementById("perf");
const stage = document.getElementById("stage");

const STAGE_WIDTH = 1020;
const MIN_STAGE_HEIGHT = 760;
const DEFAULT_FIGURE_TARGET_HEIGHT = 360;
const DEFAULT_FONT_FAMILY = 'Georgia, "Times New Roman", serif';
const DEFAULT_FONT_SIZE = 16;
const LINE_HEIGHT = 1.48;
const POUR_LINE_HEIGHT = 1.42;
const MIN_SAMPLE_FPS = 6;
const MAX_SAMPLE_FPS = 24;
const MAX_DELTA_PERCENT = 12;
const DEFAULT_SMOOTHNESS = 0;
const FORM_BAND_HEIGHT = 6;
const FORM_TIERS = 3;
const FORM_GAP = 10;
const DEFAULT_VIDEO_URL = "./assets/dancing-text-tiny.mp4";
const DEFAULT_VIDEO_NAME = "dancing-text-tiny.mp4";

const DEFAULT_TEXT = `Realtime layout should feel a little magical. One moment the passage is open and still, and the next a figure cuts into it like a live element, forcing every line to renegotiate its path. The important part is not the animation alone. The important part is that the animation is data.

This version works from a source video. The browser decodes the clip, samples it at a chosen cadence, isolates the subject silhouette, compiles each kept frame into an exclusion assembly, and then animates those cached fields through form(). The text does not fake its motion with CSS wrapping tricks or pre-authored columns. It responds to the actual shape in play right now.

That makes the demo a good proxy for editorial tools, playful reading surfaces, and interactive layout systems. A moving subject can enter the field. The text can adapt immediately. A user can drag the figure or feed in a different clip, and the same API contract still holds.`;

const SPARKLES = [
  { x: 172, y: 126, delay: "0s", size: 12 },
  { x: 814, y: 98, delay: "0.8s", size: 16 },
  { x: 912, y: 236, delay: "1.4s", size: 13 },
  { x: 256, y: 542, delay: "0.5s", size: 11 },
  { x: 758, y: 588, delay: "1.1s", size: 15 },
  { x: 112, y: 420, delay: "1.7s", size: 10 }
];

const glowLayer = document.createElement("div");
const sparkleLayer = document.createElement("div");
const piecesLayer = document.createElement("div");
const dancerLayer = document.createElement("div");

let frames = [];
let frameIndex = 0;
let isPlaying = true;
let lastTick = 0;
let playbackTime = 0;
let dragState = null;
let formQueued = false;
let renderRevision = 0;
let lastRenderedFrameIndex = -1;
let formDurations = [];
let layoutDurations = [];
let lastPerfPaintAt = 0;
let buildRevision = 0;
let isPourMode = false;
let hasBuiltFrames = false;
let extractionDirty = false;
let currentVideoFile = null;
let currentVideoName = "";

const dancerState = {
  x: 360,
  y: 180
};

textInput.value = DEFAULT_TEXT;
smoothnessValue.textContent = `${DEFAULT_SMOOTHNESS}%`;
figureSizeValue.textContent = `${DEFAULT_FIGURE_TARGET_HEIGHT} px`;
stage.style.width = `${STAGE_WIDTH}px`;
stage.style.minHeight = `${MIN_STAGE_HEIGHT}px`;
stage.replaceChildren(glowLayer, sparkleLayer, piecesLayer, dancerLayer);

function setStatus(message, isError = false) {
  status.className = isError ? "status error" : "status";
  status.textContent = message;
}

function getReadyStatusMessage() {
  return currentVideoFile ? `Ready to build "${currentVideoName}".` : "";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mean(values) {
  if (!values.length) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function setPerfSummary(summary) {
  perf.textContent = summary;
}

function updateLivePerfSummary(result) {
  const now = performance.now();
  if (isPlaying && now - lastPerfPaintAt < 180) {
    return;
  }

  lastPerfPaintAt = now;
  const avgWallMs = mean(formDurations);
  const avgLayoutMs = mean(layoutDurations);
  const modeLabel = isPourMode ? "pour" : "form";

  setPerfSummary(
    `${modeLabel} layout avg ${avgLayoutMs.toFixed(2)} ms | wall ${avgWallMs.toFixed(2)} ms | ${frames.length} cached frame(s)`
  );
}

function getText() {
  return textInput.value.trim() || DEFAULT_TEXT;
}

function getFontFamily() {
  return fontFamilyInput.value || DEFAULT_FONT_FAMILY;
}

function getFontSize() {
  return Math.max(8, Number(fontSizeInput.value) || DEFAULT_FONT_SIZE);
}

function getSmoothness() {
  return Math.min(100, Math.max(0, parseInt(smoothnessInput.value, 10) || DEFAULT_SMOOTHNESS));
}

function getSampleFps() {
  const ratio = getSmoothness() / 100;
  return Math.round(MIN_SAMPLE_FPS + (MAX_SAMPLE_FPS - MIN_SAMPLE_FPS) * ratio);
}

function getDeltaThreshold() {
  const thresholdPercent = ((100 - getSmoothness()) / 100) * MAX_DELTA_PERCENT;
  return thresholdPercent / 100;
}

function getFigureTargetHeight() {
  return Math.max(120, parseInt(figureSizeInput.value, 10) || DEFAULT_FIGURE_TARGET_HEIGHT);
}

function updateSmoothnessLabel() {
  smoothnessValue.textContent = `${getSmoothness()}%`;
}

function updateFigureSizeLabel() {
  figureSizeValue.textContent = `${getFigureTargetHeight()} px`;
}

function updateModeCopy() {
  if (formModeInput) formModeInput.checked = !isPourMode;
  if (pourModeInput) pourModeInput.checked = isPourMode;
}

function syncBuildButtonState() {
  buildButton.disabled = !currentVideoFile || !extractionDirty;
}

function markExtractionDirty() {
  extractionDirty = true;
  if (hasBuiltFrames) {
    setStatus("Extraction settings changed. Click Build to refresh cached frames.");
  }
  syncBuildButtonState();
}

function setProgress(current, total, label) {
  const safeTotal = Math.max(1, total);
  const percent = Math.max(0, Math.min(100, (current / safeTotal) * 100));
  progress.classList.add("active");
  progressLabel.textContent = label;
  progressPercent.textContent = `${Math.round(percent)}%`;
  progressFill.style.width = `${percent}%`;
}

function clearProgress(label = "Ready") {
  progressLabel.textContent = label;
  progressPercent.textContent = "100%";
  progressFill.style.width = "100%";
  progress.classList.remove("active");
}

function renderProgress(keptCount, sampledCount, duration) {
  setPerfSummary(
    `Building: ${sampledCount} sampled, ${keptCount} kept, ${duration.toFixed(2)} s source, ${getSampleFps()} fps`
  );
}

function layoutMetrics(frame) {
  const stageHeight = Math.max(MIN_STAGE_HEIGHT, dancerState.y + frame.height + 160);
  const maxX = Math.max(0, STAGE_WIDTH - frame.width - 28);
  const maxY = Math.max(0, stageHeight - frame.height - 28);
  dancerState.x = clamp(dancerState.x, 28, maxX);
  dancerState.y = clamp(dancerState.y, 38, maxY);
  return { stageHeight };
}

function buildGlowNode(frame) {
  const glow = document.createElement("div");
  glow.className = "hero-glow";
  glow.style.left = `${dancerState.x + frame.width / 2}px`;
  glow.style.top = `${dancerState.y + frame.height / 2}px`;
  return glow;
}

function buildDancerNode(frame) {
  const dancer = document.createElement("div");
  dancer.className = "dancer";
  if (dragState) dancer.classList.add("dragging");
  if (isPourMode) dancer.classList.add("pour-mode");
  dancer.style.left = `${dancerState.x}px`;
  dancer.style.top = `${dancerState.y}px`;
  dancer.style.width = `${frame.width}px`;
  dancer.style.height = `${frame.height}px`;
  // The preview is geometry chrome. It must match the engine's untransformed
  // assembly bounds exactly in both form and pour modes.
  dancer.style.transform = "none";
  dancer.dataset.role = "dancer";

  const image = document.createElement("img");
  image.src = isPourMode
    ? frame.formPreviewUrl
    : frame.imageUrl;
  dancer.appendChild(image);
  return dancer;
}

function buildSparkleNode(spec) {
  const node = document.createElement("div");
  node.className = "sparkle";
  node.style.left = `${spec.x}px`;
  node.style.top = `${spec.y}px`;
  node.style.width = `${spec.size}px`;
  node.style.height = `${spec.size}px`;
  node.style.animationDelay = spec.delay;
  return node;
}

function ensureStaticLayers() {
  if (!sparkleLayer.childElementCount) {
    for (const sparkle of SPARKLES) {
      sparkleLayer.appendChild(buildSparkleNode(sparkle));
    }
  }
}

function renderResult(result, frame, frameChanged = false) {
  ensureStaticLayers();
  stage.style.height = `${Math.max(MIN_STAGE_HEIGHT, result.height + 140, dancerState.y + frame.height + 120)}px`;

  glowLayer.replaceChildren(buildGlowNode(frame));
  piecesLayer.replaceChildren();
  piecesLayer.style.transform = "";

  // -- Layoutmaster: Render result.pieces --
  // Each piece carries final x/y/width/height and its text slice - already
  // broken and positioned around the exclusion field. No browser reflow needed.
  for (const piece of result.pieces) {
    helpers.renderPiece(piecesLayer, piece);
  }

  dancerLayer.replaceChildren(buildDancerNode(frame));
}

function renderPourResult(result, frame, frameChanged = false) {
  ensureStaticLayers();
  stage.style.height = `${Math.max(MIN_STAGE_HEIGHT, dancerState.y + frame.height + 120)}px`;

  glowLayer.replaceChildren(buildGlowNode(frame));
  piecesLayer.replaceChildren();
  piecesLayer.style.transform = `translate(${dancerState.x}px, ${dancerState.y}px)`;

  for (const piece of result.pieces) {
    helpers.renderPiece(piecesLayer, piece);
  }

  dancerLayer.replaceChildren(buildDancerNode(frame));
}

function scheduleForm() {
  if (formQueued) return;
  formQueued = true;
  requestAnimationFrame(() => {
    formQueued = false;
    renderForm();
  });
}

async function renderForm() {
  if (!frames.length) {
    stage.style.height = `${MIN_STAGE_HEIGHT}px`;
    return;
  }

  const revision = ++renderRevision;
  const frame = frames[frameIndex % frames.length];
  layoutMetrics(frame);

  try {
    // Demo helper: this DOMless control panel must ask the browser to resolve
    // the selected font before taking a synchronous Layoutmaster measurement.
    await prepareBrowserFonts({
      fontFamily: getFontFamily(),
      fontSize: getFontSize(),
      text: getText()
    });
    if (revision !== renderRevision) return;

    // -- Layoutmaster: Reposition assembly via fromJSON --
    // Injects the current drag position into the cached JSON. Synchronous and
    // cheap - the silhouette sampling already happened at build time.
    const formAssembly = exclusion.fromJSON(frame.formAssemblyJson, {
      x: dancerState.x,
      y: dancerState.y
    });
    const pourAssembly = exclusion.fromJSON(frame.formAssemblyJson, {
      x: 0,
      y: 0
    });
    const started = performance.now();
    // -- Layoutmaster: Live form while playing, direct pour when paused --
    // Playback keeps the original obstacle-wrapping demo. Paused mode uses the
    // exact same positioned assembly token as a direct pour target so we can
    // inspect the verified field without rebuilding any geometry.
    const result = isPourMode
      ? pour(getText(), pourAssembly, {
        fontFamily: getFontFamily(),
        fontSize: getFontSize(),
        lineHeight: POUR_LINE_HEIGHT
      })
      : form(getText(), {
        width: STAGE_WIDTH,
        fontFamily: getFontFamily(),
        fontSize: getFontSize(),
        lineHeight: LINE_HEIGHT,
        exclusions: [formAssembly]
      });
    const ended = performance.now();

    if (revision !== renderRevision) return;

    formDurations.push(ended - started);
    if (formDurations.length > 24) formDurations.shift();
    layoutDurations.push(result.performance.layoutMs);
    if (layoutDurations.length > 24) layoutDurations.shift();

    const frameChanged = frameIndex !== lastRenderedFrameIndex;
    lastRenderedFrameIndex = frameIndex;

    if (isPourMode) {
      renderPourResult(result, frame, frameChanged);
    } else {
      renderResult(result, frame, frameChanged);
    }
    updateLivePerfSummary(result);
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function beginDrag(event) {
  const dancer = event.target instanceof HTMLElement ? event.target.closest('[data-role="dancer"]') : null;
  if (!(dancer instanceof HTMLElement) || !frames.length) return;

  const frame = frames[frameIndex % frames.length];
  const rect = stage.getBoundingClientRect();
  dragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left - dancerState.x,
    offsetY: event.clientY - rect.top - dancerState.y,
    width: frame.width,
    height: frame.height
  };
  stage.setPointerCapture(event.pointerId);
}

function updateDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const rect = stage.getBoundingClientRect();
  const stageHeight = stage.clientHeight || MIN_STAGE_HEIGHT;
  dancerState.x = clamp(event.clientX - rect.left - dragState.offsetX, 28, Math.max(28, STAGE_WIDTH - dragState.width - 28));
  dancerState.y = clamp(event.clientY - rect.top - dragState.offsetY, 38, Math.max(38, stageHeight - dragState.height - 28));
  // Exclusions are plain data - updating the position and calling form() is
  // the entire re-layout path. No special incremental update API required.
  scheduleForm();
}

function endDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (stage.hasPointerCapture?.(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId);
  }
  dragState = null;
}

async function buildDanceFromVideo() {
  const file = currentVideoFile;
  if (!file) {
    setStatus("Choose an MP4 first.", true);
    return;
  }

  const thisBuild = ++buildRevision;
  buildButton.disabled = true;
  playButton.disabled = true;
  setStatus("Decoding the video and extracting pose assemblies...");
  setProgress(0, 1, "Loading video metadata...");
  setPerfSummary("Working...");

  try {
    const nextFrames = await helpers.extractDanceFramesFromVideoFile(file, {
      sampleFps: getSampleFps(),
      deltaThreshold: getDeltaThreshold(),
      targetHeight: getFigureTargetHeight(),
      bandHeight: FORM_BAND_HEIGHT,
      tiers: FORM_TIERS,
      gap: FORM_GAP,
      isCancelled: () => thisBuild !== buildRevision,
      onProgress: ({ keptCount, sampledCount, totalCount, timestamp, duration, label }) => {
        setProgress(sampledCount, totalCount, label);
        renderProgress(keptCount, sampledCount, duration);
      }
    });
    if (thisBuild !== buildRevision || !nextFrames) {
      return;
    }
    frames = nextFrames;
    frameIndex = 0;
    playbackTime = 0;
    lastTick = 0;
    formDurations = [];
    layoutDurations = [];
    lastPerfPaintAt = 0;
    hasBuiltFrames = true;
    extractionDirty = false;
    dancerState.x = Math.round((STAGE_WIDTH - frames[0].width) / 2);
    dancerState.y = 170;
    playButton.disabled = false;
    playButton.textContent = isPlaying ? "Pause" : "Play";
    setStatus(`Built ${frames.length} cached animation frames from "${currentVideoName}".`);
    clearProgress("Build complete");
    scheduleForm();
  } catch (error) {
    console.error(error);
    frames = [];
    hasBuiltFrames = false;
    setStatus(error instanceof Error ? error.message : String(error), true);
    clearProgress("Build failed");
    setPerfSummary("Build failed.");
  } finally {
    if (thisBuild === buildRevision) {
      syncBuildButtonState();
    }
  }
}

async function loadBundledVideo() {
  buildButton.disabled = true;
  playButton.disabled = true;
  setStatus(`Loading bundled video "${DEFAULT_VIDEO_NAME}"...`);
  try {
    const response = await fetch(DEFAULT_VIDEO_URL);
    if (!response.ok) {
      throw new Error(`Failed to load bundled video: ${response.status}`);
    }
    const blob = await response.blob();
    currentVideoFile = typeof File === "function"
      ? new File([blob], DEFAULT_VIDEO_NAME, { type: blob.type || "video/mp4" })
      : blob;
    currentVideoName = DEFAULT_VIDEO_NAME;
    hasBuiltFrames = false;
    extractionDirty = true;
    setStatus(getReadyStatusMessage());
    syncBuildButtonState();
    await buildDanceFromVideo();
  } catch (error) {
    console.error(error);
    currentVideoFile = null;
    currentVideoName = "";
    setStatus(error instanceof Error ? error.message : String(error), true);
    syncBuildButtonState();
  }
}

function togglePlayback() {
  isPlaying = !isPlaying;
  playButton.textContent = isPlaying ? "Pause" : "Play";
  lastTick = 0;
  scheduleForm();
}

function togglePourMode() {
  isPourMode = Boolean(pourModeInput?.checked);
  updateModeCopy();
  scheduleForm();
}

function tick(timestamp) {
  if (isPlaying && frames.length) {
    if (!lastTick) {
      lastTick = timestamp;
    }
    const elapsedMs = Math.max(0, timestamp - lastTick);
    lastTick = timestamp;

    const duration = Math.max(frames[frames.length - 1]?.timestamp || 0, 0.001);
    playbackTime = (playbackTime + elapsedMs / 1000) % duration;

    let nextFrameIndex = 0;
    while (
      nextFrameIndex + 1 < frames.length &&
      frames[nextFrameIndex + 1].timestamp <= playbackTime
    ) {
      nextFrameIndex += 1;
    }

    if (nextFrameIndex !== frameIndex) {
      frameIndex = nextFrameIndex;
      scheduleForm();
    }
  }
  requestAnimationFrame(tick);
}

stage.addEventListener("pointerdown", beginDrag);
stage.addEventListener("pointermove", updateDrag);
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

buildButton.addEventListener("click", buildDanceFromVideo);
playButton.addEventListener("click", togglePlayback);
videoInput.addEventListener("change", () => {
  const file = videoInput.files?.[0] || null;
  currentVideoFile = file;
  currentVideoName = file?.name || "";
  hasBuiltFrames = false;
  extractionDirty = true;
  formDurations = [];
  layoutDurations = [];
  lastPerfPaintAt = 0;
  playButton.disabled = true;
  setPerfSummary("No frames loaded yet.");
  playbackTime = 0;
  lastTick = 0;
  setStatus(getReadyStatusMessage());
  syncBuildButtonState();
});
smoothnessInput.addEventListener("input", () => {
  updateSmoothnessLabel();
  markExtractionDirty();
});
figureSizeInput.addEventListener("input", () => {
  updateFigureSizeLabel();
  markExtractionDirty();
});
formModeInput.addEventListener("change", togglePourMode);
pourModeInput.addEventListener("change", togglePourMode);
textInput.addEventListener("input", scheduleForm);
fontFamilyInput.addEventListener("change", scheduleForm);
fontSizeInput.addEventListener("input", scheduleForm);

updateSmoothnessLabel();
updateFigureSizeLabel();
updateModeCopy();
syncBuildButtonState();
requestAnimationFrame(tick);
loadBundledVideo();

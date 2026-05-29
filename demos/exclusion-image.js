// -- Layoutmaster API --
// `helpers.imageToExclusion` samples an image alpha channel into a weighted
// assembly token; `form` treats that token as a first-class spatial obstacle.
import { exclusion, form } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";
import { prepareBrowserFonts } from "./helpers/prepare-browser-fonts.js";

const fileInput   = document.getElementById("file-input");
const urlInput    = document.getElementById("url-input");
const widthInput  = document.getElementById("width-input");
const heightInput = document.getElementById("height-input");
const ratioLock   = document.getElementById("ratio-lock");
const fontFamilyInput = document.getElementById("font-family-input");
const fontSizeInput   = document.getElementById("font-size-input");
const textInput   = document.getElementById("text-input");
const status      = document.getElementById("status");
const perf        = document.getElementById("perf");
const surface     = document.getElementById("surface");

const SURFACE_WIDTH = 860;
const LINE_HEIGHT   = 1.42;

const DEFAULT_IMAGE_WIDTH  = 220;
const DEFAULT_IMAGE_HEIGHT = 260;
const MAX_IMAGE_WIDTH      = 300;
const MAX_IMAGE_HEIGHT     = 340;
const MIN_IMAGE_SIZE       = 72;

const IMAGE_BAND_HEIGHT = 6;
const IMAGE_TIERS       = 3;
const IMAGE_GAP         = 8;
const DEFAULT_IMAGE_URL = "./assets/pinup.png";

const DEFAULT_TEXT = `The loaded image becomes an exclusion assembly: a compact set of weighted rectangles derived from the image alpha channel.

Pass that assembly directly to form and the engine treats it as a first-class spatial obstacle. Text flows around the shape with the same precision as any authored exclusion field: no browser reflow, no separate collision layer, no post-processing.

Drag the image to reposition the field. The demo rebuilds the form from the same serialized assembly, so moving the image is cheap and keeps the engine as the only layout authority.`;

textInput.value = DEFAULT_TEXT;

let currentUrl     = null;
let baseJson       = null;
let baseWidth      = DEFAULT_IMAGE_WIDTH;
let baseHeight     = DEFAULT_IMAGE_HEIGHT;
let fieldPos       = { x: 60, y: 36 };
let aspectRatio    = DEFAULT_IMAGE_WIDTH / DEFAULT_IMAGE_HEIGHT;
let dragState      = null;
let frameRequested = false;
let buildFrame     = false;
let buildToken     = 0;
let renderToken    = 0;
let prevObjectUrl  = null;

function num(input, fallback = 0) {
  const v = parseFloat(input.value);
  return isFinite(v) ? v : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getText() {
  return textInput.value.trim() || DEFAULT_TEXT;
}

function getOptions() {
  return {
    width:  Math.max(MIN_IMAGE_SIZE, num(widthInput, DEFAULT_IMAGE_WIDTH)),
    height: Math.max(MIN_IMAGE_SIZE, num(heightInput, DEFAULT_IMAGE_HEIGHT))
  };
}

function getTypography() {
  return {
    fontFamily: fontFamilyInput.value,
    fontSize:   clamp(num(fontSizeInput, 20), 8, 96)
  };
}

function setStatus(message, isError = false) {
  status.className   = isError ? "status error" : "status";
  status.textContent = message;
}

function normalizeDemoDimensions(naturalWidth, naturalHeight) {
  const scale = Math.min(
    MAX_IMAGE_WIDTH / naturalWidth,
    MAX_IMAGE_HEIGHT / naturalHeight,
    1
  );
  return {
    width:  Math.max(MIN_IMAGE_SIZE, Math.round(naturalWidth * scale)),
    height: Math.max(MIN_IMAGE_SIZE, Math.round(naturalHeight * scale))
  };
}

function prefillDimensions(naturalWidth, naturalHeight) {
  const size = normalizeDemoDimensions(naturalWidth, naturalHeight);
  widthInput.value  = size.width;
  heightInput.value = size.height;
  aspectRatio = naturalWidth / naturalHeight;
  fieldPos = {
    x: clamp(fieldPos.x, 0, Math.max(0, SURFACE_WIDTH - size.width)),
    y: fieldPos.y
  };
}

function clearAssembly() {
  baseJson = null;
  scheduleRender();
}

function scheduleBuildExclusion() {
  if (!currentUrl || buildFrame) return;
  buildFrame = true;
  requestAnimationFrame(() => {
    buildFrame = false;
    buildExclusion();
  });
}

// -- Layoutmaster: Extract exclusion assembly from image --
// The demo hides the sampling knobs because they are implementation detail here.
// The output remains a normal exclusion assembly consumed directly by `form`.
async function buildExclusion() {
  if (!currentUrl) return;

  const token = ++buildToken;
  const opts = getOptions();

  baseJson   = null;
  baseWidth  = opts.width;
  baseHeight = opts.height;
  setStatus("Building exclusion...");
  scheduleRender();

  try {
    const assembly = await helpers.imageToExclusion(currentUrl, {
      x:          fieldPos.x,
      y:          fieldPos.y,
      width:      opts.width,
      height:     opts.height,
      bandHeight: IMAGE_BAND_HEIGHT,
      tiers:      IMAGE_TIERS,
      gap:        IMAGE_GAP
    });

    if (token !== buildToken) return;

    baseJson   = assembly.toJSON();
    baseWidth  = opts.width;
    baseHeight = opts.height;

    scheduleRender();
    setStatus(`${assembly.parts.count} exclusion parts | ${opts.width}x${opts.height}px field`);
  } catch (err) {
    if (token !== buildToken) return;
    console.error(err);
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

// -- Layoutmaster: Reposition assembly via fromJSON --
// fromJSON rebuilds a full assembly token from serialized layers, injecting
// new x/y. Synchronous and cheap; no image re-sampling on every drag frame.
function getAssemblyAtPos() {
  if (!baseJson) return null;
  return exclusion.fromJSON(baseJson, {
    x:   fieldPos.x,
    y:   fieldPos.y,
    gap: IMAGE_GAP
  });
}

// -- Layoutmaster: form with the assembly as a spatial exclusion --
// The assembly token drops into `exclusions` identically to a circle or polygon.
// The engine negotiates all field types in one unified pass.
async function renderForm() {
  frameRequested = false;
  const token    = ++renderToken;
  const assembly = getAssemblyAtPos();
  const opts     = getOptions();
  const type     = getTypography();
  const w        = baseJson ? baseWidth  : opts.width;
  const h        = baseJson ? baseHeight : opts.height;

  surface.style.width = `${SURFACE_WIDTH}px`;
  surface.replaceChildren();

  try {
    // Demo helper: this DOMless control panel must ask the browser to resolve
    // the selected font before taking a synchronous Layoutmaster measurement.
    await prepareBrowserFonts({
      fontFamily: type.fontFamily,
      fontSize: type.fontSize,
      text: getText()
    });
    if (token !== renderToken) return;

    const result = form(getText(), {
      width:      SURFACE_WIDTH,
      fontFamily: type.fontFamily,
      fontSize:   type.fontSize,
      lineHeight: LINE_HEIGHT,
      exclusions: assembly ? [assembly] : []
    });

    surface.style.height = `${Math.max(480, result.height + 32, fieldPos.y + h + 48)}px`;

    const p = result.performance;
    perf.textContent =
      `${result.pieces.length} pieces\n` +
      `layout   ${p.layoutMs.toFixed(2)} ms\n` +
      `wrap     ${p.wrapStreamMs.toFixed(2)} ms\n` +
      `collider ${p.colliderFieldQueryCalls} queries`;

    // -- Layoutmaster: Render result.pieces --
    // Each piece carries final x/y/width/height and its text slice - already
    // broken and positioned around the exclusion field. Render exactly what
    // came back; no browser reflow, no second set of collision rules.
    for (const piece of result.pieces) {
      helpers.renderPiece(surface, piece);
    }

    if (currentUrl) {
      const overlay = document.createElement("div");
      overlay.className    = "field-overlay";
      overlay.style.left   = `${fieldPos.x}px`;
      overlay.style.top    = `${fieldPos.y}px`;
      overlay.style.width  = `${w}px`;
      overlay.style.height = `${h}px`;

      const img = document.createElement("img");
      img.src = currentUrl;
      overlay.appendChild(img);
      surface.appendChild(overlay);
    }
  } catch (err) {
    console.error(err);
    setStatus(err instanceof Error ? err.message : String(err), true);
    perf.textContent = "";
    surface.style.height = "480px";
  }
}

function scheduleRender() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(renderForm);
}

function imageLoaded(image) {
  prefillDimensions(image.naturalWidth, image.naturalHeight);
  clearAssembly();
  scheduleBuildExclusion();
}

function imageFailed() {
  clearAssembly();
  setStatus("Image could not be loaded.", true);
}

function inspectImage(url, crossOrigin = false) {
  const img = new Image();
  if (crossOrigin) img.crossOrigin = "anonymous";
  img.onload = () => imageLoaded(img);
  img.onerror = imageFailed;
  img.src = url;
}

function loadImageUrl(url, label = "image", crossOrigin = false) {
  if (prevObjectUrl) {
    URL.revokeObjectURL(prevObjectUrl);
    prevObjectUrl = null;
  }
  currentUrl = url;
  fileInput.value = "";
  urlInput.value = url.startsWith("./") ? "" : url;
  clearAssembly();
  setStatus(`Loading ${label}...`);
  inspectImage(url, crossOrigin);
}

widthInput.addEventListener("input", () => {
  if (ratioLock.checked && aspectRatio) {
    heightInput.value = Math.round(num(widthInput) / aspectRatio);
  }
  clearAssembly();
  scheduleBuildExclusion();
});

heightInput.addEventListener("input", () => {
  if (ratioLock.checked && aspectRatio) {
    widthInput.value = Math.round(num(heightInput) * aspectRatio);
  }
  clearAssembly();
  scheduleBuildExclusion();
});

surface.addEventListener("pointerdown", event => {
  const target = event.target instanceof HTMLElement ? event.target.closest(".field-overlay") : null;
  if (!(target instanceof HTMLElement)) return;
  const rect = surface.getBoundingClientRect();
  dragState = {
    offsetX:   event.clientX - rect.left - fieldPos.x,
    offsetY:   event.clientY - rect.top  - fieldPos.y,
    pointerId: event.pointerId
  };
  target.classList.add("dragging");
  surface.setPointerCapture(event.pointerId);
});

surface.addEventListener("pointermove", event => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const rect = surface.getBoundingClientRect();
  const opts = getOptions();
  const w    = baseJson ? baseWidth  : opts.width;
  const h    = baseJson ? baseHeight : opts.height;
  fieldPos = {
    x: clamp(event.clientX - rect.left - dragState.offsetX, 0, Math.max(0, SURFACE_WIDTH - w)),
    y: clamp(event.clientY - rect.top  - dragState.offsetY, 0, Math.max(0, surface.offsetHeight - h))
  };
  scheduleRender();
});

surface.addEventListener("pointerup", event => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (surface.hasPointerCapture?.(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  dragState = null;
});

surface.addEventListener("pointercancel", event => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (surface.hasPointerCapture?.(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  dragState = null;
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (prevObjectUrl) URL.revokeObjectURL(prevObjectUrl);

  currentUrl     = URL.createObjectURL(file);
  prevObjectUrl  = currentUrl;
  urlInput.value = "";

  clearAssembly();
  setStatus("Loading image...");
  inspectImage(currentUrl);
});

urlInput.addEventListener("change", () => {
  const url = urlInput.value.trim();
  if (!url) return;
  loadImageUrl(url, "remote image", true);
});

textInput.addEventListener("input", scheduleRender);
fontFamilyInput.addEventListener("change", scheduleRender);
fontSizeInput.addEventListener("input", scheduleRender);

scheduleRender();
loadImageUrl(DEFAULT_IMAGE_URL, "bundled image");

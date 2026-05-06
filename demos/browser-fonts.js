import {
  form
} from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";

const domSurface = document.getElementById("dom-surface");
const layoutmasterSurface = document.getElementById("layoutmaster-surface");
const status = document.getElementById("status");
const fontFamilyInput = document.getElementById("font-family-input");
const widthInput = document.getElementById("width-input");
const fontSizeInput = document.getElementById("font-size-input");
const lineHeightInput = document.getElementById("line-height-input");
const showPiecesInput = document.getElementById("show-pieces-input");
const textInput = document.getElementById("text-input");
const params = new URLSearchParams(window.location.search);
if (params.has("width")) widthInput.value = params.get("width");
if (params.has("fontSize")) fontSizeInput.value = params.get("fontSize");
if (params.has("lineHeight")) lineHeightInput.value = params.get("lineHeight");
if (params.has("fontFamily")) fontFamilyInput.value = params.get("fontFamily");
showPiecesInput.checked = params.has("frames");

function readOptions() {
  return {
    width: Math.max(180, Number(widthInput.value) || 560),
    fontFamily: fontFamilyInput.value || "system-ui, sans-serif",
    fontSize: Math.max(8, Number(fontSizeInput.value) || 24),
    lineHeight: Math.max(0.8, Number(lineHeightInput.value) || 1.35)
  };
}

function applySurfaceStyle(node, options) {
  node.style.width = `${options.width}px`;
  node.style.fontFamily = options.fontFamily;
  node.style.fontSize = `${options.fontSize}px`;
  node.style.lineHeight = String(options.lineHeight);
}

function renderLayoutmaster(result, options, showPieces) {
  layoutmasterSurface.replaceChildren();
  layoutmasterSurface.style.height = `${Math.max(1, result.height)}px`;
  for (const piece of result.pieces) {
    const renderedPiece = {
      fontFamily: options.fontFamily,
      fontSize: options.fontSize,
      ...piece
    };
    if (showPieces) {
      helpers.renderPieceChrome(layoutmasterSurface, renderedPiece, { baseline: true });
    }
    helpers.renderPiece(layoutmasterSurface, renderedPiece);
  }
}

async function run() {
  const options = readOptions();
  const text = textInput.value;

  applySurfaceStyle(domSurface, options);
  applySurfaceStyle(layoutmasterSurface, options);
  domSurface.textContent = text;
  status.textContent = "Checking page fonts...";

  const fontStatus = await waitForPageFonts();
  const result = form(text, options);
  renderLayoutmaster(result, options, showPiecesInput.checked);

  const domHeight = domSurface.getBoundingClientRect().height;
  status.textContent = [
    `${result.pieces.length} pieces`,
    `DOM ${domHeight.toFixed(1)}px`,
    `Layoutmaster ${result.height.toFixed(1)}px`,
    `fonts ${fontStatus}`
  ].join(" | ");
}

async function waitForPageFonts() {
  const fontSet = document.fonts;
  if (!fontSet || !fontSet.ready) {
    return "untracked";
  }
  if (fontSet.status === "loading") {
    await fontSet.ready;
  }
  return fontSet.status || "ready";
}

let pending = 0;
function scheduleRun() {
  const token = ++pending;
  window.requestAnimationFrame(() => {
    if (token === pending) run().catch((error) => {
      console.error(error);
      status.textContent = error instanceof Error ? error.message : String(error);
    });
  });
}

for (const input of [fontFamilyInput, widthInput, fontSizeInput, lineHeightInput, showPiecesInput, textInput]) {
  input.addEventListener("input", scheduleRun);
}

if (document.fonts && typeof document.fonts.addEventListener === "function") {
  document.fonts.addEventListener("loadingdone", scheduleRun);
  document.fonts.addEventListener("loadingerror", scheduleRun);
}

scheduleRun();

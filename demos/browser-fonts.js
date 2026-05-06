import {
  form
} from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";

const SAMPLES = {
  multilingual: {
    fontFamily: '"Inter", system-ui, "Noto Sans Arabic", "Noto Sans SC", sans-serif',
    width: 560,
    fontSize: 24,
    lineHeight: 1.35,
    text: "Browser fallback should stay browser-owned: Latin text, العربية الفصحى, עברית קצרה, 中文排版, 日本語の文, 한국어 문장, हिन्दी पाठ, ไทยภาษา, emoji 😀✨."
  },
  serif: {
    fontFamily: 'Georgia, "Times New Roman", Times, serif',
    width: 520,
    fontSize: 26,
    lineHeight: 1.42,
    text: "Serif stack, browser chosen: A quick literary line with 123,456. Then עברית קצרה, العربية الفصحى, 日本語の文, and a final italic-looking cadence."
  },
  emoji: {
    fontFamily: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
    width: 500,
    fontSize: 28,
    lineHeight: 1.45,
    text: "Emoji should come from the platform: text 😀😄✨⚙︎♥︎, flags 🇺🇸🇯🇵, skin tones 👋🏽, CJK 中文, Arabic العربية, Hebrew עברית."
  },
  bidi: {
    fontFamily: '"Inter", system-ui, "Noto Sans Arabic", "Noto Sans Hebrew", sans-serif',
    width: 460,
    fontSize: 23,
    lineHeight: 1.5,
    text: 'Bidi punctuation: עברית קצרה, العربية الفصحى, numbers (123,456), percent 100%, quote "VMPrint", then English again.'
  }
};

const domSurface = document.getElementById("dom-surface");
const layoutmasterSurface = document.getElementById("layoutmaster-surface");
const sampleInput = document.getElementById("sample-input");
const fontFamilyInput = document.getElementById("font-family-input");
const widthInput = document.getElementById("width-input");
const fontSizeInput = document.getElementById("font-size-input");
const lineHeightInput = document.getElementById("line-height-input");
const showPiecesInput = document.getElementById("show-pieces-input");
const textInput = document.getElementById("text-input");
const piecesMetric = document.getElementById("pieces-metric");
const domMetric = document.getElementById("dom-metric");
const layoutMetric = document.getElementById("layout-metric");
const fontMetric = document.getElementById("font-metric");
const requestedFontReadout = document.getElementById("requested-font-readout");
const computedFontReadout = document.getElementById("computed-font-readout");

const params = new URLSearchParams(window.location.search);
let suppressSampleUpdate = false;

if (params.has("sample") && SAMPLES[params.get("sample")]) {
  applySample(params.get("sample"));
} else {
  applySample(sampleInput.value);
}
if (params.has("width")) widthInput.value = params.get("width");
if (params.has("fontSize")) fontSizeInput.value = params.get("fontSize");
if (params.has("lineHeight")) lineHeightInput.value = params.get("lineHeight");
if (params.has("fontFamily")) fontFamilyInput.value = params.get("fontFamily");
if (params.has("text")) textInput.value = params.get("text");
showPiecesInput.checked = params.has("frames");

function applySample(sampleName) {
  const sample = SAMPLES[sampleName] || SAMPLES.multilingual;
  suppressSampleUpdate = true;
  sampleInput.value = sampleName in SAMPLES ? sampleName : "multilingual";
  fontFamilyInput.value = sample.fontFamily;
  widthInput.value = String(sample.width);
  fontSizeInput.value = String(sample.fontSize);
  lineHeightInput.value = String(sample.lineHeight);
  textInput.value = sample.text;
  suppressSampleUpdate = false;
}

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
  setMetric(fontMetric, "Checking", "draft");

  const fontStatus = await waitForPageFonts();
  const result = form(text, options);
  renderLayoutmaster(result, options, showPiecesInput.checked);

  const domHeight = domSurface.getBoundingClientRect().height;
  const delta = result.height - domHeight;
  const deltaText = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}px`;
  const computedFontFamily = window.getComputedStyle(domSurface).fontFamily;

  setMetric(piecesMetric, String(result.pieces.length));
  setMetric(domMetric, `${domHeight.toFixed(1)}px`);
  setMetric(layoutMetric, `${result.height.toFixed(1)}px`);
  setMetric(fontMetric, fontStatus, fontStatus === "loaded" || fontStatus === "ready" ? "good" : "draft");
  requestedFontReadout.textContent = options.fontFamily;
  computedFontReadout.textContent = `${computedFontFamily}\nheight delta: ${deltaText}`;
}

function setMetric(node, value, tone = "") {
  node.classList.toggle("good", tone === "good");
  node.classList.toggle("draft", tone === "draft");
  node.classList.toggle("warn", tone === "warn");
  node.querySelector("strong").textContent = value;
}

async function waitForPageFonts() {
  const fontSet = document.fonts;
  if (!fontSet || !fontSet.ready) {
    return "untracked";
  }
  if (fontSet.status === "loading") {
    await fontSet.ready;
  }
  return fontSet.status === "loaded" ? "loaded" : (fontSet.status || "ready");
}

let pending = 0;
function scheduleRun() {
  const token = ++pending;
  window.requestAnimationFrame(() => {
    if (token === pending) run().catch((error) => {
      console.error(error);
      setMetric(fontMetric, "Error", "warn");
      computedFontReadout.textContent = error instanceof Error ? error.message : String(error);
    });
  });
}

sampleInput.addEventListener("change", () => {
  if (sampleInput.value === "custom") return;
  applySample(sampleInput.value);
  scheduleRun();
});

for (const input of [fontFamilyInput, widthInput, fontSizeInput, lineHeightInput, showPiecesInput, textInput]) {
  input.addEventListener("input", () => {
    if (!suppressSampleUpdate && input !== showPiecesInput) {
      sampleInput.value = "custom";
    }
    scheduleRun();
  });
}

if (document.fonts && typeof document.fonts.addEventListener === "function") {
  document.fonts.addEventListener("loading", () => setMetric(fontMetric, "Loading", "draft"));
  document.fonts.addEventListener("loadingdone", scheduleRun);
  document.fonts.addEventListener("loadingerror", () => {
    setMetric(fontMetric, "Font error", "warn");
    scheduleRun();
  });
}

scheduleRun();

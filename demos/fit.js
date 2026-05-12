// -- Layoutmaster API --
// `fit` fills a bounded region with as much text as will fit, then stops.
// It returns both what landed inside and what overflowed.
import { fit } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";
import { prepareBrowserFonts } from "./helpers/prepare-browser-fonts.js";

const chain = document.getElementById("chain");
const widthInput = document.getElementById("width-input");
const heightInput = document.getElementById("height-input");
const fontFamilyInput = document.getElementById("font-family-input");
const fontSizeInput = document.getElementById("font-size-input");
const lineHeightInput = document.getElementById("line-height-input");
const hyphenationInput = document.getElementById("hyphenation-input");
const textInput = document.getElementById("text-input");
const showPiecesInput = document.getElementById("show-pieces-input");
const status = document.getElementById("status");
const resultComplete = document.getElementById("result-complete");
const resultConsumed = document.getElementById("result-consumed");
const resultRemaining = document.getElementById("result-remaining");
const resultHyphenated = document.getElementById("result-hyphenated");
const consumedOutput = document.getElementById("consumed-text");
const remainingOutput = document.getElementById("remaining-text");

function getCurrentInputs() {
  return {
    width: Number(widthInput.value),
    height: Number(heightInput.value),
    fontFamily: fontFamilyInput.value || '"Times New Roman", Times, serif',
    fontSize: Number(fontSizeInput.value),
    lineHeight: Number(lineHeightInput.value),
    hyphenation: hyphenationInput.value,
    showPieces: showPiecesInput.checked,
    sourceText: textInput.value
  };
}

function buildFitOptions(width, height, fontFamily, fontSize, lineHeight, hyphenation) {
  return {
    width,
    height,
    fontFamily,
    fontSize,
    lineHeight,
    hyphenation
  };
}

function renderTarget(result, width, height, fontFamily, fontSize, lineHeight, showPieces) {
  const card = document.createElement("section");
  card.className = "region-card";
  card.style.width = `${width}px`;

  const header = document.createElement("div");
  header.className = "region-header";

  const region = document.createElement("div");
  region.className = "region";
  region.style.width = `${width}px`;
  region.style.height = `${height}px`;

  const title = document.createElement("div");
  title.textContent = "Target";
  header.appendChild(title);

  const meta = document.createElement("div");
  const visibleTextLength = (result.pieces || []).reduce((sum, piece) => sum + String(piece.text || "").length, 0);
  const usedHeight = result.height;
  const slack = Math.max(0, height - usedHeight);
  meta.textContent = `${visibleTextLength} chars | ${result.pieces.length} piece(s) | used ${usedHeight.toFixed(1)} / ${height}px | slack ${slack.toFixed(1)}px`;
  header.appendChild(meta);

  // -- Layoutmaster: Render result.pieces --
  // Same placement contract as form(): absolute x/y, width/height, text slice.
  for (const piece of result.pieces) {
    if (showPieces) {
      helpers.renderPieceChrome(region, piece, { baseline: true });
    }
    helpers.renderPiece(region, piece);
  }

  card.append(header, region);
  return card;
}

function updateResultPanel(result) {
  const content = result.content;
  const usedHeight = result.height;
  status.className = "status";
  status.textContent = `${result.pieces.length} piece(s) placed | used ${usedHeight.toFixed(1)}px | layout ${result.performance.layoutMs.toFixed(2)} ms | wrap ${result.performance.wrapStreamMs.toFixed(2)} ms`;
  resultComplete.textContent = content.complete ? "Yes" : "No";
  resultConsumed.textContent = String(content.consumed.length);
  resultRemaining.textContent = String(content.remaining.length);
  resultHyphenated.textContent = content.hyphenated ? "Yes" : "No";
  consumedOutput.textContent = content.consumed.text || "(empty)";
  remainingOutput.textContent = content.remaining.text || "(empty)";
}

function showFitError(message) {
  status.className = "status error";
  status.textContent = `Fit failed: ${message}`;
  resultComplete.textContent = "-";
  resultConsumed.textContent = "-";
  resultRemaining.textContent = "-";
  resultHyphenated.textContent = "-";
  consumedOutput.textContent = message;
  remainingOutput.textContent = message;
}

let runToken = 0;

async function runFit() {
  const token = ++runToken;
  status.className = "status";
  status.textContent = "Preparing fonts...";
  chain.replaceChildren();

  try {
    const { width, height, fontFamily, fontSize, lineHeight, hyphenation, showPieces, sourceText } = getCurrentInputs();
    const fitOptions = buildFitOptions(width, height, fontFamily, fontSize, lineHeight, hyphenation);
    // Demo helper: this DOMless control panel must ask the browser to resolve
    // the selected font before taking a synchronous Layoutmaster measurement.
    await prepareBrowserFonts({ fontFamily, fontSize, text: sourceText });
    if (token !== runToken) return;
    status.textContent = "Fitting...";

    // -- Layoutmaster: Fit --
    // result.content reports what fit and the overflow that can continue into
    // the next region or page.
    const result = fit(sourceText, fitOptions);

    chain.appendChild(renderTarget(result, width, height, fontFamily, fontSize, lineHeight, showPieces));
    updateResultPanel(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    showFitError(message);
  }
}

widthInput.addEventListener("input", () => {
  runFit();
});

heightInput.addEventListener("input", () => {
  runFit();
});

showPiecesInput.addEventListener("change", () => {
  runFit();
});

hyphenationInput.addEventListener("change", () => {
  runFit();
});

fontFamilyInput.addEventListener("change", () => {
  runFit();
});

fontSizeInput.addEventListener("input", () => {
  runFit();
});

lineHeightInput.addEventListener("input", () => {
  runFit();
});

textInput.addEventListener("input", () => {
  runFit();
});

runFit();

// -- Layoutmaster API --
// `form` lays out an unbounded passage and returns positioned text fragments.
import { form } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";
import { prepareBrowserFonts } from "./helpers/prepare-browser-fonts.js";

const surface = document.getElementById("surface");
const surfaceWidthInput = document.getElementById("surface-width-input");
const fontFamilyInput = document.getElementById("font-family-input");
const fontSizeInput = document.getElementById("font-size-input");
const lineHeightInput = document.getElementById("line-height-input");
const textInput = document.getElementById("text-input");
const showPiecesInput = document.getElementById("show-pieces-input");
const status = document.getElementById("status");

function clearSurface() {
  surface.replaceChildren();
}

function getSurfaceVerticalPadding() {
  const style = getComputedStyle(surface);
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  return paddingTop + paddingBottom;
}

// -- Layoutmaster: Render result.pieces --
// Each piece carries pre-computed position (x, y), dimensions (width, height),
// and its text slice. Stamp them onto the page as-is - no browser reflow.
function renderResultPieces(result, showPieces) {
  clearSurface();
  surface.style.height = `${Math.max(0, result.height + getSurfaceVerticalPadding())}px`;
  for (const piece of result.pieces) {
    if (showPieces) {
      helpers.renderPieceChrome(surface, piece, { baseline: true });
    }
    helpers.renderPiece(surface, piece);
  }
}

let runToken = 0;

async function runForm() {
  const token = ++runToken;
  status.className = "status";
  status.textContent = "Preparing fonts...";
  try {
    const surfaceWidth = Math.max(160, Number(surfaceWidthInput.value) || 860);
    const fontFamily = fontFamilyInput.value || '"Times New Roman", Times, serif';
    const fontSize = Number(fontSizeInput.value) || 16;
    const lineHeight = Number(lineHeightInput.value) || 1.4;
    const text = textInput.value;
    const showPieces = showPiecesInput.checked;

    surface.style.width = `${surfaceWidth}px`;
    // Demo helper: this DOMless control panel must ask the browser to resolve
    // the selected font before taking a synchronous Layoutmaster measurement.
    await prepareBrowserFonts({ fontFamily, fontSize, text });
    if (token !== runToken) return;
    status.textContent = "Forming...";

    // -- Layoutmaster: form --
    // Core form reads explicit options; DOM authoring helpers live in helpers.
    const result = form(text, {
      width: surfaceWidth,
      fontFamily,
      fontSize,
      lineHeight
    });
    renderResultPieces(result, showPieces);
    status.textContent = `${result.pieces.length} pieces | ${result.height.toFixed(1)} px height | layout ${result.performance.layoutMs.toFixed(2)} ms | wrap ${result.performance.wrapStreamMs.toFixed(2)} ms | ${fontFamilyInput.options[fontFamilyInput.selectedIndex]?.text || "Custom font"}`;
  } catch (error) {
    console.error(error);
    status.className = "status error";
    status.textContent = error instanceof Error ? error.message : String(error);
    clearSurface();
    surface.style.height = "0px";
  }
}

showPiecesInput.addEventListener("change", runForm);
surfaceWidthInput.addEventListener("input", runForm);
fontFamilyInput.addEventListener("change", runForm);
fontSizeInput.addEventListener("input", runForm);
lineHeightInput.addEventListener("input", runForm);
textInput.addEventListener("input", runForm);

runForm();

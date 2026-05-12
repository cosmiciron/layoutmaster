// -- Layoutmaster API --
// `flow` distributes a passage across an ordered list of bounded regions,
// advancing through each until the text is exhausted or regions run out.
import { flow } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";
import { prepareBrowserFonts } from "./helpers/prepare-browser-fonts.js";

const fontFamilyInput = document.getElementById("font-family-input");
const fontSizeInput = document.getElementById("font-size-input");
const lineHeightInput = document.getElementById("line-height-input");
const hyphenationInput = document.getElementById("hyphenation-input");
const textInput = document.getElementById("text-input");
const showPiecesInput = document.getElementById("show-pieces-input");
const flowButton = document.getElementById("flow-button");
const regionGrid = document.getElementById("region-grid");
const resultSummary = document.getElementById("result-summary");
const resultComplete = document.getElementById("result-complete");
const resultConsumed = document.getElementById("result-consumed");
const resultRemaining = document.getElementById("result-remaining");
const resultHyphenated = document.getElementById("result-hyphenated");
const consumedOutput = document.getElementById("consumed-text");
const remainingOutput = document.getElementById("remaining-text");

function getTargetInputs() {
  return [
    {
      width: Number(document.getElementById("target-1-width").value),
      height: Number(document.getElementById("target-1-height").value)
    },
    {
      width: Number(document.getElementById("target-2-width").value),
      height: Number(document.getElementById("target-2-height").value)
    },
    {
      width: Number(document.getElementById("target-3-width").value),
      height: Number(document.getElementById("target-3-height").value)
    }
  ];
}

function getCurrentInputs() {
  return {
    fontFamily: fontFamilyInput.value || '"Times New Roman", Times, serif',
    fontSize: Number(fontSizeInput.value),
    lineHeight: Number(lineHeightInput.value),
    hyphenation: hyphenationInput.value,
    text: textInput.value,
    showPieces: showPiecesInput.checked,
    targets: getTargetInputs()
  };
}

// -- Layoutmaster: Build flow targets --
// Each target is an independent layout request - its own width, height, and
// typographic options. flow() works through them in order, carrying overflow
// from one to the next.
function buildFlowTargets(targets, fontFamily, fontSize, lineHeight, hyphenation) {
  return targets.map((target) => ({
    width: target.width,
    height: target.height,
    fontFamily,
    fontSize,
    lineHeight,
    hyphenation
  }));
}

function renderPlacementCard(placement, target, fontFamily, fontSize, lineHeight, showPieces) {
  const card = document.createElement("section");
  card.className = "region-card";
  card.style.width = `${target.width}px`;

  const header = document.createElement("div");
  header.className = "region-header";

  const title = document.createElement("div");
  title.textContent = `Target ${placement.index + 1}`;
  header.appendChild(title);

  const meta = document.createElement("div");
  const usedHeight = placement.height;
  const slack = Math.max(0, target.height - usedHeight);
  meta.textContent = `${placement.content.consumed.length} chars | ${placement.pieces.length} piece(s) | used ${usedHeight.toFixed(1)} / ${target.height}px | slack ${slack.toFixed(1)}px`;
  header.appendChild(meta);

  const region = document.createElement("div");
  region.className = "region";
  region.style.width = `${target.width}px`;
  region.style.height = `${target.height}px`;

  // -- Layoutmaster: Render placement.pieces --
  // Same placement contract as form(): absolute x/y, width/height, text slice.
  for (const piece of placement.pieces) {
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
  resultSummary.textContent = `${result.placements.length} target(s) processed`;
  resultComplete.textContent = content.complete ? "Yes" : "No";
  resultConsumed.textContent = String(content.consumed.length);
  resultRemaining.textContent = String(content.remaining.length);
  resultHyphenated.textContent = content.hyphenated ? "Yes" : "No";
  consumedOutput.textContent = content.consumed.text || "(empty)";
  remainingOutput.textContent = content.remaining.text || "(empty)";
}

function showFlowError(message) {
  resultSummary.textContent = `Flow failed: ${message}`;
  resultComplete.textContent = "-";
  resultConsumed.textContent = "-";
  resultRemaining.textContent = "-";
  resultHyphenated.textContent = "-";
  consumedOutput.textContent = message;
  remainingOutput.textContent = message;
}

let runToken = 0;

async function runFlow() {
  const token = ++runToken;
  flowButton.disabled = true;
  resultSummary.textContent = "Preparing fonts...";
  regionGrid.replaceChildren();

  try {
    const { fontFamily, fontSize, lineHeight, hyphenation, text, showPieces, targets } = getCurrentInputs();
    const flowTargets = buildFlowTargets(targets, fontFamily, fontSize, lineHeight, hyphenation);
    // Demo helper: this DOMless control panel must ask the browser to resolve
    // the selected font before taking a synchronous Layoutmaster measurement.
    await prepareBrowserFonts({ fontFamily, fontSize, text });
    if (token !== runToken) return;
    resultSummary.textContent = "Flowing...";
    // -- Layoutmaster: Flow --
    // One call distributes the passage across all targets. result.placements[i]
    // holds the pieces and content report for each region.
    const result = flow(text, flowTargets);

    for (const placement of result.placements) {
      const target = targets[placement.index];
      regionGrid.appendChild(renderPlacementCard(placement, target, fontFamily, fontSize, lineHeight, showPieces));
    }

    updateResultPanel(result);
  } catch (error) {
    console.error(error);
    showFlowError(error instanceof Error ? error.message : String(error));
  } finally {
    if (token === runToken) {
      flowButton.disabled = false;
    }
  }
}

flowButton.addEventListener("click", runFlow);
showPiecesInput.addEventListener("change", runFlow);
fontFamilyInput.addEventListener("change", runFlow);
hyphenationInput.addEventListener("change", runFlow);
fontSizeInput.addEventListener("input", runFlow);
lineHeightInput.addEventListener("input", runFlow);
textInput.addEventListener("input", runFlow);
document.getElementById("target-1-width").addEventListener("input", runFlow);
document.getElementById("target-1-height").addEventListener("input", runFlow);
document.getElementById("target-2-width").addEventListener("input", runFlow);
document.getElementById("target-2-height").addEventListener("input", runFlow);
document.getElementById("target-3-width").addEventListener("input", runFlow);
document.getElementById("target-3-height").addEventListener("input", runFlow);

runFlow();

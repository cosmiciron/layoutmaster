import { produce } from "@layoutmaster/layoutmaster";

const SAMPLE_ASSET_URL = "./assets/html-atlas-big-326-pages.json";

const searchInput = document.getElementById("search-input");
const statusNode = document.getElementById("status");
const atlasNode = document.getElementById("atlas");
const wallNode = document.getElementById("wall");
const selectionReadout = document.getElementById("selection-readout");
const zoomNode = document.getElementById("zoom");
const zoomPageNode = document.getElementById("zoom-page");
const zoomControlsNode = document.getElementById("zoom-controls");
const zoomPrevButton = document.getElementById("zoom-prev");
const zoomNextButton = document.getElementById("zoom-next");
const zoomPageLabel = document.getElementById("zoom-page-label");

let currentResult = null;
let currentFileName = "";
let currentSearch = "";
let zoomedPage = null;
let currentDocumentFontFamily = '"Times New Roman", Times, serif';
let renderStartedAt = 0;

wallNode.addEventListener("click", async (event) => {
  if (event.target?.id === "load-sample") {
    await loadSampleAsset();
  }
});

searchInput.addEventListener("input", () => {
  currentSearch = searchInput.value.trim();
  renderAtlas();
  if (zoomedPage) {
    renderZoomPage(zoomedPage);
  }
});

document.addEventListener("selectionchange", updateSelectionReadout);
zoomNode.addEventListener("click", closeZoom);
zoomPageNode.addEventListener("click", (event) => event.stopPropagation());
zoomPageNode.addEventListener("mousedown", (event) => event.stopPropagation());
zoomControlsNode.addEventListener("click", (event) => event.stopPropagation());
zoomControlsNode.addEventListener("mousedown", (event) => event.stopPropagation());
zoomPrevButton.addEventListener("click", () => openZoomByOffset(-1));
zoomNextButton.addEventListener("click", () => openZoomByOffset(1));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeZoom();
  } else if (zoomedPage && event.key === "ArrowLeft") {
    openZoomByOffset(-1);
  } else if (zoomedPage && event.key === "ArrowRight") {
    openZoomByOffset(1);
  }
});

new ResizeObserver(() => renderAtlas()).observe(atlasNode);

async function loadSampleAsset() {
  statusNode.textContent = "Loading sample atlas...";
  const response = await fetch(SAMPLE_ASSET_URL);
  if (!response.ok) {
    throw new Error(`[layoutmaster-demo] Could not load sample atlas: ${response.status}`);
  }
  loadText(await response.text(), "Oasis: The Fabric of Fate");
}

function loadText(text, fileName) {
  const startedAt = performance.now();
  currentDocumentFontFamily = resolveDocumentFontFamily(text);
  const result = produce(text);
  currentResult = result;
  currentFileName = fileName;
  zoomedPage = null;
  renderStartedAt = performance.now();
  renderAtlas();
  const elapsedMs = performance.now() - startedAt;
  setStatus(result, elapsedMs, performance.now() - renderStartedAt);
}

function renderAtlas() {
  wallNode.replaceChildren();
  if (!currentResult?.pages?.length) {
    wallNode.append(createIntroNode());
    return;
  }

  renderStartedAt = performance.now();
  const pages = currentResult.pages;
  const layout = computeWallLayout(pages, wallNode.clientWidth, wallNode.clientHeight);
  const searchHitsByPage = countOccurrencesByPage(pages, currentSearch);

  for (const placement of layout.placements) {
    const hitCount = searchHitsByPage.get(placement.page.index) || 0;
    const shell = renderPageShell(placement.page, layout.scale, { hitCount });
    if (zoomedPage && Number(zoomedPage.index) === Number(placement.page.index)) {
      shell.classList.add("is-zoom-source");
    }
    shell.style.left = px(placement.x);
    shell.style.top = px(placement.y);
    shell.addEventListener("dblclick", () => openZoom(placement.page));
    wallNode.append(shell);
  }

  setStatus(currentResult, null, performance.now() - renderStartedAt);
}

function createIntroNode() {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.innerHTML = `
    <div class="intro">
      <h2>Oasis, as living HTML.</h2>
      <p>
        The sample is <em>Oasis: The Fabric of Fate</em>, an unpublished philosophical novel about fate, freedom, politics, power, and human nature.
      </p>
      <p>
        Layoutmaster asks the engine to paginate the whole manuscript, then projects the returned page pieces into ordinary HTML. At atlas scale it feels like a dense canvas; up close it is still selectable, searchable, highlightable text that the browser understands.
      </p>
      <p>
        That split is the point: huge solved spatial surfaces without giving up native text interaction. A novel becomes the proof object for a stranger class of frontend interfaces.
      </p>
      <button id="load-sample" class="sample-action" type="button">Produce the atlas</button>
    </div>
  `;
  return empty;
}

function computeWallLayout(pages, width, height) {
  const first = pages[0] || {};
  const pageWidth = Math.max(1, Number(first.width || 612));
  const pageHeight = Math.max(1, Number(first.height || 792));
  const pageCount = pages.length;
  const gapBase = 22;
  let best = null;

  for (let columns = 1; columns <= pageCount; columns += 1) {
    const rows = Math.ceil(pageCount / columns);
    const scaleX = (width - gapBase * Math.max(0, columns - 1)) / (columns * pageWidth);
    const scaleY = (height - gapBase * Math.max(0, rows - 1)) / (rows * pageHeight);
    const scale = Math.max(0.01, Math.min(scaleX, scaleY));
    const usedWidth = columns * pageWidth * scale + Math.max(0, columns - 1) * gapBase;
    const usedHeight = rows * pageHeight * scale + Math.max(0, rows - 1) * gapBase;
    const score = scale - Math.abs(width - usedWidth) * 0.000001 - Math.abs(height - usedHeight) * 0.000001;
    if (!best || score > best.score) {
      best = { columns, rows, scale, usedWidth, usedHeight, score };
    }
  }

  const gap = Math.max(6, Math.min(gapBase, pageWidth * best.scale * 0.55));
  const usedWidth = best.columns * pageWidth * best.scale + Math.max(0, best.columns - 1) * gap;
  const usedHeight = best.rows * pageHeight * best.scale + Math.max(0, best.rows - 1) * gap;
  const originX = Math.max(0, (width - usedWidth) / 2);
  const originY = Math.max(0, (height - usedHeight) / 2);
  const placements = pages.map((page, index) => {
    const column = index % best.columns;
    const row = Math.floor(index / best.columns);
    return {
      page,
      x: originX + column * (pageWidth * best.scale + gap),
      y: originY + row * (pageHeight * best.scale + gap)
    };
  });

  return { ...best, gap, placements };
}

function renderPageShell(page, scale, options = {}) {
  const shell = document.createElement("div");
  shell.className = "page-shell";
  shell.dataset.pageIndex = String(page.index);
  if (Number(options.hitCount || 0) > 0) {
    shell.classList.add("has-search-hit");
    shell.dataset.hitCount = String(options.hitCount);
  }
  shell.style.width = px(page.width * scale);
  shell.style.height = px(page.height * scale);

  const inner = document.createElement("div");
  inner.className = "page-inner";
  inner.style.width = px(page.width);
  inner.style.height = px(page.height);
  inner.style.fontFamily = currentDocumentFontFamily;
  inner.style.transform = `scale(${scale})`;

  for (const piece of page.pieces || []) {
    renderPiece(inner, piece);
  }

  shell.append(inner);
  const pageNumber = document.createElement("span");
  pageNumber.className = "page-number";
  pageNumber.textContent = String(pageDisplayNumber(page));
  shell.append(pageNumber);
  return shell;
}

function renderPiece(container, piece) {
  if (piece?.kind !== "text" || !piece.text) return;

  const metrics = resolveTextMetrics(piece);
  const node = document.createElement("span");
  node.className = "piece";
  node.style.left = px(piece.x);
  node.style.top = px(metrics.top);
  node.style.width = px(piece.width);
  node.style.height = px(metrics.height);
  node.style.lineHeight = px(metrics.height);
  applyTextPaint(node, piece);
  node.dir = piece.direction === "rtl" ? "rtl" : "ltr";
  appendHighlightedText(node, String(piece.text), currentSearch);
  container.append(node);
}

function appendHighlightedText(node, text, query) {
  if (!query) {
    node.textContent = text;
    return;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerQuery, cursor);
    if (index < 0) {
      node.append(document.createTextNode(text.slice(cursor)));
      break;
    }
    if (index > cursor) {
      node.append(document.createTextNode(text.slice(cursor, index)));
    }
    const mark = document.createElement("mark");
    mark.textContent = text.slice(index, index + query.length);
    node.append(mark);
    cursor = index + query.length;
  }
}

function openZoom(page) {
  zoomedPage = page;
  updateZoomSourceHighlight();
  renderZoomPage(page);
  zoomNode.classList.add("is-open");
  zoomNode.setAttribute("aria-hidden", "false");
}

function renderZoomPage(page) {
  zoomPageNode.replaceChildren();
  const scale = Math.min(
    (window.innerWidth - 56) / Math.max(1, page.width),
    (window.innerHeight - 56) / Math.max(1, page.height),
    1.35
  );
  const shell = renderPageShell(page, scale);
  shell.style.position = "relative";
  shell.style.left = "0";
  shell.style.top = "0";
  zoomPageNode.style.width = px(page.width * scale);
  zoomPageNode.style.height = px(page.height * scale);
  zoomPageNode.append(shell);
  updateZoomControls(page);
}

function openZoomByOffset(offset) {
  if (!zoomedPage || !currentResult?.pages?.length) return;
  const pageIndex = currentResult.pages.findIndex((page) => Number(page.index) === Number(zoomedPage.index));
  const nextIndex = Math.max(0, Math.min(currentResult.pages.length - 1, pageIndex + offset));
  if (nextIndex === pageIndex) return;
  zoomedPage = currentResult.pages[nextIndex];
  updateZoomSourceHighlight();
  renderZoomPage(zoomedPage);
}

function updateZoomSourceHighlight() {
  for (const shell of wallNode.querySelectorAll(".page-shell.is-zoom-source")) {
    shell.classList.remove("is-zoom-source");
  }

  if (!zoomedPage) return;

  const zoomedPageIndex = String(zoomedPage.index);
  for (const shell of wallNode.querySelectorAll(".page-shell")) {
    if (shell.dataset.pageIndex === zoomedPageIndex) {
      shell.classList.add("is-zoom-source");
      return;
    }
  }
}

function updateZoomControls(page) {
  const pages = currentResult?.pages || [];
  const pageIndex = pages.findIndex((candidate) => Number(candidate.index) === Number(page.index));
  zoomPrevButton.disabled = pageIndex <= 0;
  zoomNextButton.disabled = pageIndex < 0 || pageIndex >= pages.length - 1;
  zoomPageLabel.textContent = `Page ${pageDisplayNumber(page)} / ${pages.length}`;
}

function closeZoom() {
  zoomedPage = null;
  updateZoomSourceHighlight();
  zoomNode.classList.remove("is-open");
  zoomNode.setAttribute("aria-hidden", "true");
  zoomPageNode.replaceChildren();
  zoomPageLabel.textContent = "Page 1 / 1";
  zoomPrevButton.disabled = true;
  zoomNextButton.disabled = true;
}

function updateSelectionReadout() {
  const selection = window.getSelection();
  const selected = String(selection?.toString() || "").replace(/\s+/g, " ").trim();
  if (!selected) {
    selectionReadout.textContent = "Nothing selected.";
    return;
  }
  selectionReadout.textContent = `${selected.length} chars: ${selected.slice(0, 220)}`;
}

function setStatus(result, totalElapsedMs, renderElapsedMs) {
  if (!result?.pages) return;
  const searchHitsByPage = countOccurrencesByPage(result.pages, currentSearch);
  const searchCount = sumHitCounts(searchHitsByPage);
  const searchPageCount = searchHitsByPage.size;
  const timing = totalElapsedMs == null
    ? `render ${formatMs(renderElapsedMs)}`
    : `produce ${formatMs(totalElapsedMs)} | render ${formatMs(renderElapsedMs)}`;
  statusNode.textContent = [
    currentFileName || "document",
    `${result.pages.length} page(s)`,
    `${countPieces(result.pages)} piece(s)`,
    currentSearch ? `${searchCount} hit(s) on ${searchPageCount} page(s)` : "",
    timing
  ].filter(Boolean).join(" | ");
}

function countPieces(pages) {
  return pages.reduce((sum, page) => sum + Number(page.pieces?.length || 0), 0);
}

function pageDisplayNumber(page) {
  return Number(page?.index || 0) + 1;
}

function countOccurrencesByPage(pages, query) {
  const needle = String(query || "").toLowerCase();
  const hitsByPage = new Map();
  if (!needle) return hitsByPage;
  for (const page of pages) {
    let count = 0;
    for (const piece of page.pieces || []) {
      const text = String(piece.text || "").toLowerCase();
      let index = text.indexOf(needle);
      while (index >= 0) {
        count += 1;
        index = text.indexOf(needle, index + needle.length);
      }
    }
    if (count > 0) {
      hitsByPage.set(page.index, count);
    }
  }
  return hitsByPage;
}

function sumHitCounts(hitsByPage) {
  let total = 0;
  for (const count of hitsByPage.values()) {
    total += count;
  }
  return total;
}

function resolveTextMetrics(piece) {
  const baselineY = Number(piece?.baselineY);
  const fontSize = Number(piece?.fontSize);
  const ascent = Number(piece?.ascent);
  const descent = Number(piece?.descent);
  if (Number.isFinite(baselineY)
    && Number.isFinite(fontSize)
    && fontSize > 0
    && Number.isFinite(ascent)
    && ascent > 0) {
    const ascentPx = (ascent / 1000) * fontSize;
    const descentPx = Number.isFinite(descent) && descent >= 0
      ? (descent / 1000) * fontSize
      : Math.max(0, Number(piece?.height || 0) - ascentPx);
    return {
      top: baselineY - ascentPx,
      height: Math.max(1, ascentPx + descentPx)
    };
  }

  return {
    top: Number(piece?.y || 0),
    height: Math.max(1, Number(piece?.height || 0))
  };
}

function applyTextPaint(node, piece) {
  setStyle(node, "fontFamily", piece?.fontFamily);
  setStyle(node, "fontSize", piece?.fontSize, px);
  setStyle(node, "letterSpacing", piece?.letterSpacing, px);
  setStyle(node, "fontWeight", piece?.fontWeight);
  setStyle(node, "fontStyle", piece?.fontStyle);
  setStyle(node, "color", piece?.color);
}

function resolveDocumentFontFamily(sourceText) {
  try {
    const documentInput = JSON.parse(sourceText);
    return normalizeDemoFontFamily(documentInput?.layout?.fontFamily);
  } catch {
    return '"Times New Roman", Times, serif';
  }
}

function normalizeDemoFontFamily(fontFamily) {
  const family = String(fontFamily || "").trim();
  if (!family || family === "Tinos") {
    return '"Times New Roman", Times, serif';
  }
  return family;
}

function setStyle(node, property, value, formatter = String) {
  if (value == null || value === "") return;
  node.style[property] = formatter(value);
}

function px(value) {
  const numeric = Number(value);
  return `${Number.isFinite(numeric) ? numeric : 0}px`;
}

function formatMs(value) {
  return `${Number(value || 0).toFixed(1)} ms`;
}

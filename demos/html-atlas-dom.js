import sampleDocument from "./assets/html-atlas-big-326-pages.js";

const searchInput = document.getElementById("search-input");
const widowOrphanToggle = document.getElementById("widow-orphan-toggle");
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

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGINS = { top: 72, right: 72, bottom: 72, left: 72 };
const BODY_WIDTH = PAGE_WIDTH - MARGINS.left - MARGINS.right;
const BODY_HEIGHT = PAGE_HEIGHT - MARGINS.top - MARGINS.bottom;
const DEFAULT_FONT_FAMILY = '"Times New Roman", Times, serif';
const DEFAULT_FONT_SIZE = 12;
const DEFAULT_LINE_HEIGHT = 2;

let currentPages = [];
let currentSearch = "";
let currentSourceText = "";
let zoomedPage = null;
let currentDocumentFontFamily = DEFAULT_FONT_FAMILY;
let currentHeaderTemplate = "";
let currentSuppressFirstPageHeader = false;
let lastTimings = null;
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

widowOrphanToggle.addEventListener("change", () => {
  if (currentSourceText) {
    paginateText(currentSourceText);
  } else {
    setStatus();
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
  paginateText(sampleDocument);
}

function paginateText(source) {
  currentSourceText = source;
  const startedAt = performance.now();
  const documentInput = cloneDocument(source);
  const parseMs = performance.now() - startedAt;
  currentDocumentFontFamily = normalizeDemoFontFamily(documentInput?.layout?.fontFamily);
  currentHeaderTemplate = resolveHeaderTemplate(documentInput);
  currentSuppressFirstPageHeader = documentInput?.header?.firstPage === null;

  statusNode.textContent = "Paginating with DOM measurement...";
  const paginateStartedAt = performance.now();
  const needsTotalPageCount = currentHeaderTemplate.includes("{totalPages}");
  const countPages = needsTotalPageCount
    ? paginateDocument(documentInput, { emitPieces: false })
    : null;
  currentPages = paginateDocument(documentInput, {
    totalPages: countPages ? countPages.length : undefined,
    emitPieces: true
  });
  const paginateMs = performance.now() - paginateStartedAt;

  zoomedPage = null;
  lastTimings = { parseMs, paginateMs };
  renderStartedAt = performance.now();
  renderAtlas();
  lastTimings.renderMs = performance.now() - renderStartedAt;
  setStatus();
}

function paginateDocument(documentInput, options = {}) {
  const blocks = normalizeBlocks(documentInput?.elements || []);
  const measurer = createMeasurer();
  const pages = [];
  let currentBlocks = [];

  function commitPage() {
    pages.push(createPage(pages.length, currentBlocks, measurer, options));
    currentBlocks = [];
    measurer.body.replaceChildren();
  }

  function ensureFreshPageFor(block) {
    if (block.pageBreakBefore && currentBlocks.length > 0) {
      commitPage();
    }
  }

  for (const block of blocks) {
    ensureFreshPageFor(block);
    if (tryAppendMeasuredBlock(measurer, currentBlocks, block)) {
      continue;
    }

    if (!block.canSplit) {
      if (currentBlocks.length > 0) {
        commitPage();
      }
      tryAppendMeasuredBlock(measurer, currentBlocks, block, { force: true });
      continue;
    }

    let remaining = block.tokens;
    while (remaining.length > 0) {
      let count = findFittingTokenCount(measurer, block, remaining);
      if (widowOrphanToggle.checked && count > 0 && count < remaining.length) {
        count = applyWidowOrphanPass(measurer, block, remaining, count, currentBlocks.length > 0);
      }
      if (count === 0 && currentBlocks.length > 0) {
        commitPage();
        continue;
      }

      const take = Math.max(1, count);
      const chunk = createBlockChunk(block, remaining.slice(0, take));
      tryAppendMeasuredBlock(measurer, currentBlocks, chunk, { force: true });
      remaining = remaining.slice(take);
      if (remaining.length > 0) {
        commitPage();
      }
    }
  }

  if (currentBlocks.length > 0) {
    commitPage();
  }
  measurer.root.remove();
  return pages;
}

function tryAppendMeasuredBlock(measurer, blocks, block, options = {}) {
  const node = createBlockNode(block);
  measurer.body.append(node);
  if (!options.force && isOverflowing(measurer.body)) {
    node.remove();
    return false;
  }
  blocks.push(block);
  return true;
}

function findFittingTokenCount(measurer, block, tokens) {
  let low = 0;
  let high = tokens.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const node = createBlockNode(createBlockChunk(block, tokens.slice(0, mid)));
    measurer.body.append(node);
    const fits = !isOverflowing(measurer.body);
    node.remove();
    if (fits) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

function applyWidowOrphanPass(measurer, block, tokens, fittingCount, hasPreviousBlocks) {
  const minLines = 2;
  let count = fittingCount;

  while (count > 0) {
    const firstChunk = createBlockChunk(block, tokens.slice(0, count));
    const firstLineCount = measureBlockLineCountInContext(measurer, firstChunk);
    if (hasPreviousBlocks && firstLineCount < minLines) {
      return 0;
    }

    const rest = tokens.slice(count);
    if (rest.length === 0) {
      return count;
    }

    const restLineCount = measureBlockLineCountInScratch(measurer, createBlockChunk(block, rest));
    if (restLineCount !== 1) {
      return count;
    }

    const reduced = findPreviousLineTokenCount(measurer, block, tokens, count, firstLineCount);
    if (reduced >= count) {
      return count;
    }
    count = reduced;
  }

  return count;
}

function findPreviousLineTokenCount(measurer, block, tokens, count, currentLineCount) {
  for (let next = count - 1; next > 0; next -= 1) {
    const lineCount = measureBlockLineCountInContext(
      measurer,
      createBlockChunk(block, tokens.slice(0, next))
    );
    if (lineCount < currentLineCount) {
      return next;
    }
  }
  return count;
}

function measureBlockLineCountInContext(measurer, block) {
  const node = createBlockNode(block);
  measurer.body.append(node);
  const lineCount = countNodeLines(node);
  node.remove();
  return lineCount;
}

function measureBlockLineCountInScratch(measurer, block) {
  const node = createBlockNode(block);
  measurer.scratch.replaceChildren(node);
  const lineCount = countNodeLines(node);
  measurer.scratch.replaceChildren();
  return lineCount;
}

function countNodeLines(node) {
  const tops = [];
  const tokens = Array.from(node.querySelectorAll("[data-dom-piece-token]"));
  for (const token of tokens) {
    for (const rect of token.getClientRects()) {
      if (rect.width <= 0.01 && rect.height <= 0.01) continue;
      if (!tops.some(top => Math.abs(top - rect.top) < 1.25)) {
        tops.push(rect.top);
      }
    }
  }
  return tops.length;
}

function isOverflowing(node) {
  return node.scrollHeight > BODY_HEIGHT + 0.5;
}

function createMeasurer() {
  const root = document.createElement("div");
  root.style.cssText = [
    "position:fixed",
    "left:-20000px",
    "top:0",
    "visibility:hidden",
    "pointer-events:none",
    `width:${PAGE_WIDTH}px`,
    `height:${PAGE_HEIGHT}px`,
    "background:#fff",
    "contain:layout style paint"
  ].join(";");

  const body = document.createElement("div");
  body.className = "dom-page-body";
  body.style.position = "absolute";
  body.style.fontFamily = currentDocumentFontFamily;
  root.append(body);

  const header = document.createElement("div");
  header.className = "dom-page-header";
  header.style.position = "absolute";
  header.style.fontFamily = currentDocumentFontFamily;
  root.append(header);

  const scratch = document.createElement("div");
  scratch.className = "dom-page-body";
  scratch.style.position = "absolute";
  scratch.style.left = `${PAGE_WIDTH + 96}px`;
  scratch.style.fontFamily = currentDocumentFontFamily;
  root.append(scratch);
  document.body.append(root);
  return { root, body, header, scratch };
}

function createPage(index, blocks, measurer, options = {}) {
  const bodyPieces = options.emitPieces === false
    ? []
    : extractPiecesFromNode(measurer.body);
  const headerPieces = options.emitPieces === false
    ? []
    : measureHeaderPieces(measurer, index, options.totalPages);
  const headerText = pageHeaderText(index, options.totalPages);
  return {
    index,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    blocks: blocks.map(cloneBlock),
    pieces: [...headerPieces, ...bodyPieces],
    plainText: [headerText, blocks.map(blockPlainText).join("\n")].filter(Boolean).join("\n")
  };
}

function normalizeBlocks(elements) {
  const blocks = [];
  for (const element of elements) {
    const block = normalizeElementBlock(element);
    if (block) {
      blocks.push(block);
    }
  }
  return blocks;
}

function normalizeElementBlock(element) {
  if (!element || typeof element !== "object") return null;
  if (element.type === "table") {
    return normalizeCoverTable(element);
  }

  const style = element.properties?.style || {};
  const runs = collectRuns(element, {});
  if (runs.length === 0 && typeof element.content === "string" && element.content !== "") {
    runs.push({ text: element.content, style: {} });
  }

  const type = element.type || "paragraph";
  const tokens = tokenizeRuns(runs);
  return {
    type,
    className: classNameForType(type),
    style: normalizeStyle(style),
    pageBreakBefore: Boolean(style.pageBreakBefore),
    canSplit: tokens.length > 1 && isSplittableType(type),
    runs,
    tokens
  };
}

function normalizeCoverTable(element) {
  const cells = [];
  for (const row of element.children || []) {
    for (const cell of row.children || []) {
      cells.push({
        text: collectPlainText(cell),
        style: normalizeStyle(cell.properties?.style || {})
      });
    }
  }
  return {
    type: "table",
    className: "dom-cover-table",
    style: normalizeStyle(element.properties?.style || {}),
    pageBreakBefore: Boolean(element.properties?.style?.pageBreakBefore),
    canSplit: false,
    cells,
    runs: cells.map(cell => ({ text: cell.text, style: cell.style })),
    tokens: []
  };
}

function collectRuns(element, inheritedStyle) {
  const style = { ...inheritedStyle, ...(element.properties?.style || {}) };
  const runs = [];
  if (typeof element.content === "string" && element.content !== "") {
    runs.push({ text: element.content, style });
  }
  for (const child of element.children || []) {
    runs.push(...collectRuns(child, style));
  }
  return runs;
}

function tokenizeRuns(runs) {
  const tokens = [];
  for (const run of runs) {
    const parts = String(run.text || "").match(/\s+|\S+/g) || [];
    for (const part of parts) {
      tokens.push({ text: part, style: normalizeStyle(run.style || {}) });
    }
  }
  return tokens;
}

function createBlockChunk(block, tokens) {
  return {
    ...block,
    runs: tokens.map(token => ({ text: token.text, style: token.style })),
    tokens,
    canSplit: tokens.length > 1
  };
}

function cloneBlock(block) {
  return {
    ...block,
    style: { ...block.style },
    cells: block.cells?.map(cell => ({ ...cell, style: { ...cell.style } })),
    runs: block.runs?.map(run => ({ ...run, style: { ...run.style } })),
    tokens: block.tokens?.map(token => ({ ...token, style: { ...token.style } }))
  };
}

function classNameForType(type) {
  switch (type) {
    case "paragraph-first": return "dom-block dom-paragraph-first";
    case "chapter-heading": return "dom-block dom-chapter-heading";
    case "blockquote": return "dom-block dom-blockquote";
    case "scene-break": return "dom-block dom-scene-break";
    case "cover-title": return "dom-block dom-cover-title";
    case "cover-line": return "dom-block dom-cover-line";
    default: return "dom-block";
  }
}

function isSplittableType(type) {
  return type === "paragraph" || type === "paragraph-first" || type === "blockquote";
}

function createBlockNode(block) {
  if (block.type === "table") {
    const node = document.createElement("div");
    node.className = block.className;
    applyBlockStyle(node, block.style);
    for (const cell of block.cells || []) {
      const span = document.createElement("span");
      span.textContent = cell.text;
      applyBlockStyle(span, cell.style);
      node.append(span);
    }
    return node;
  }

  const node = document.createElement(block.type === "chapter-heading" ? "h2" : "p");
  node.className = block.className;
  applyBlockStyle(node, block.style);
  for (const run of block.runs || []) {
    appendRun(node, run, currentSearch);
  }
  return node;
}

function appendRun(node, run, query) {
  const text = String(run.text || "");
  if (query) {
    const wrapper = needsInlineWrapper(run.style) ? document.createElement("span") : node;
    if (wrapper !== node) {
      applyBlockStyle(wrapper, run.style);
    }
    appendHighlightedText(wrapper, text, query);
    if (wrapper !== node) {
      node.append(wrapper);
    }
    return;
  }

  const parts = text.match(/\s+|\S+/g) || [text];
  for (const part of parts) {
    const token = document.createElement("span");
    token.dataset.domPieceToken = "1";
    token.textContent = part;
    applyBlockStyle(token, run.style || {});
    node.append(token);
  }
}

function needsInlineWrapper(style) {
  return !!(style.fontStyle || style.fontWeight || style.color || style.letterSpacing || style.fontSize);
}

function applyBlockStyle(node, style) {
  setStyle(node, "fontFamily", style.fontFamily);
  setStyle(node, "fontSize", style.fontSize, px);
  setStyle(node, "letterSpacing", style.letterSpacing, px);
  setStyle(node, "fontWeight", style.fontWeight);
  setStyle(node, "fontStyle", style.fontStyle);
  setStyle(node, "color", style.color);
  setStyle(node, "textAlign", style.textAlign);
  setStyle(node, "marginTop", style.marginTop, px);
  setStyle(node, "marginBottom", style.marginBottom, px);
}

function normalizeStyle(style) {
  return {
    fontFamily: normalizeDemoFontFamily(style.fontFamily),
    fontSize: style.fontSize == null ? undefined : Number(style.fontSize),
    letterSpacing: style.letterSpacing == null ? undefined : Number(style.letterSpacing),
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    color: style.color,
    textAlign: style.textAlign,
    marginTop: style.marginTop == null ? undefined : Number(style.marginTop),
    marginBottom: style.marginBottom == null ? undefined : Number(style.marginBottom)
  };
}

function renderAtlas() {
  wallNode.replaceChildren();
  if (currentPages.length === 0) {
    wallNode.append(createIntroNode());
    return;
  }

  renderStartedAt = performance.now();
  const layout = computeWallLayout(currentPages, wallNode.clientWidth, wallNode.clientHeight);
  const searchHitsByPage = countOccurrencesByPage(currentPages, currentSearch);

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

  if (lastTimings) {
    lastTimings.renderMs = performance.now() - renderStartedAt;
    setStatus();
  }
}

function createIntroNode() {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.innerHTML = `
    <div class="intro">
      <h2>Oasis, paginated by DOM.</h2>
      <p>
        The sample is <em>Oasis: The Fabric of Fate</em>, an unpublished philosophical novel about fate, freedom, politics, power, and human nature.
      </p>
      <p>
        This baseline parses the same manuscript JSON, builds ordinary DOM blocks, measures page overflow, and splits text until the browser has created a paginated wall.
      </p>
      <p>
        It intentionally uses the kind of straightforward measuring loop a frontend developer might write in a hurry: no clever layout engine, no canvas, no iframes.
      </p>
      <button id="load-sample" class="sample-action" type="button">Run DOM pagination</button>
    </div>
  `;
  return empty;
}

function computeWallLayout(pages, width, height) {
  const pageCount = pages.length;
  const gapBase = 22;
  let best = null;

  for (let columns = 1; columns <= pageCount; columns += 1) {
    const rows = Math.ceil(pageCount / columns);
    const scaleX = (width - gapBase * Math.max(0, columns - 1)) / (columns * PAGE_WIDTH);
    const scaleY = (height - gapBase * Math.max(0, rows - 1)) / (rows * PAGE_HEIGHT);
    const scale = Math.max(0.01, Math.min(scaleX, scaleY));
    const usedWidth = columns * PAGE_WIDTH * scale + Math.max(0, columns - 1) * gapBase;
    const usedHeight = rows * PAGE_HEIGHT * scale + Math.max(0, rows - 1) * gapBase;
    const score = scale - Math.abs(width - usedWidth) * 0.000001 - Math.abs(height - usedHeight) * 0.000001;
    if (!best || score > best.score) {
      best = { columns, rows, scale, usedWidth, usedHeight, score };
    }
  }

  const gap = Math.max(6, Math.min(gapBase, PAGE_WIDTH * best.scale * 0.55));
  const usedWidth = best.columns * PAGE_WIDTH * best.scale + Math.max(0, best.columns - 1) * gap;
  const usedHeight = best.rows * PAGE_HEIGHT * best.scale + Math.max(0, best.rows - 1) * gap;
  const originX = Math.max(0, (width - usedWidth) / 2);
  const originY = Math.max(0, (height - usedHeight) / 2);
  const placements = pages.map((page, index) => {
    const column = index % best.columns;
    const row = Math.floor(index / best.columns);
    return {
      page,
      x: originX + column * (PAGE_WIDTH * best.scale + gap),
      y: originY + row * (PAGE_HEIGHT * best.scale + gap)
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
  shell.style.width = px(PAGE_WIDTH * scale);
  shell.style.height = px(PAGE_HEIGHT * scale);

  const inner = document.createElement("div");
  inner.className = "page-inner";
  inner.style.width = px(PAGE_WIDTH);
  inner.style.height = px(PAGE_HEIGHT);
  inner.style.fontFamily = currentDocumentFontFamily;
  inner.style.transform = `scale(${scale})`;

  const body = document.createElement("main");
  body.className = "dom-page-body";
  body.style.fontFamily = currentDocumentFontFamily;
  if ((page.pieces || []).length > 0) {
    for (const piece of page.pieces || []) {
      renderPiece(inner, piece);
    }
  } else {
    for (const block of page.blocks || []) {
      body.append(createBlockNode(block));
    }
    inner.append(body);
  }

  shell.append(inner);
  const pageNumber = document.createElement("span");
  pageNumber.className = "page-number";
  pageNumber.textContent = String(page.index + 1);
  shell.append(pageNumber);
  return shell;
}

function measureHeaderPieces(measurer, pageIndex, totalPages) {
  const text = pageHeaderText(pageIndex, totalPages);
  if (!text) return [];

  measurer.header.replaceChildren();
  const node = document.createElement("span");
  node.dataset.domPieceToken = "1";
  node.textContent = text;
  measurer.header.append(node);
  const pieces = extractPiecesFromNode(measurer.header, MARGINS.left, 36);
  measurer.header.replaceChildren();
  return pieces;
}

function pageHeaderText(pageIndex, totalPages) {
  if (pageIndex === 0 && currentSuppressFirstPageHeader) return "";
  return materializePageText(currentHeaderTemplate, pageIndex, totalPages);
}

function materializePageText(template, pageIndex, totalPages) {
  if (!template) return "";
  return template
    .split("{physicalPageNumber}").join(String(pageIndex + 1))
    .split("{logicalPageNumber}").join(String(pageIndex + 1))
    .split("{pageNumber}").join(String(pageIndex + 1))
    .split("{totalPages}").join(totalPages == null ? "" : String(totalPages));
}

function resolveHeaderTemplate(documentInput) {
  const elements = documentInput?.header?.default?.elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    return "";
  }
  return elements.map(element => collectPlainText(element)).join(" ").trim();
}

function extractPiecesFromNode(node) {
  const nodeRect = node.getBoundingClientRect();
  const buckets = [];
  const tokens = Array.from(node.querySelectorAll("[data-dom-piece-token]"));

  for (const token of tokens) {
    const text = token.textContent || "";
    if (text === "") continue;
    const rects = Array.from(token.getClientRects());
    const computed = getComputedStyle(token);
    for (const rect of rects) {
      if (rect.width <= 0.01 && rect.height <= 0.01) continue;
      const top = rect.top - nodeRect.top;
      let bucket = buckets.find(entry => Math.abs(entry.top - top) < 1.25);
      if (!bucket) {
        bucket = { top, bottom: rect.bottom - nodeRect.top, parts: [] };
        buckets.push(bucket);
      }
      bucket.top = Math.min(bucket.top, top);
      bucket.bottom = Math.max(bucket.bottom, rect.bottom - nodeRect.top);
      bucket.parts.push({
        text,
        left: rect.left - nodeRect.left,
        right: rect.right - nodeRect.left,
        fontFamily: computed.fontFamily,
        fontSize: parseFloat(computed.fontSize) || DEFAULT_FONT_SIZE,
        fontWeight: computed.fontWeight,
        fontStyle: computed.fontStyle,
        color: computed.color,
        letterSpacing: parseFloat(computed.letterSpacing) || 0
      });
    }
  }

  return buckets
    .sort((a, b) => a.top - b.top)
    .map((bucket) => {
      const parts = bucket.parts.sort((a, b) => a.left - b.left);
      const first = parts[0] || {};
      const left = Math.min(...parts.map(part => part.left));
      const right = Math.max(...parts.map(part => part.right));
      const text = parts.map(part => part.text).join("");
      return {
        kind: "text",
        text,
        x: node.offsetLeft + left,
        y: node.offsetTop + bucket.top,
        width: Math.max(1, right - left),
        height: Math.max(1, bucket.bottom - bucket.top),
        fontFamily: first.fontFamily || currentDocumentFontFamily,
        fontSize: first.fontSize || DEFAULT_FONT_SIZE,
        fontWeight: first.fontWeight,
        fontStyle: first.fontStyle,
        color: first.color,
        letterSpacing: first.letterSpacing || 0,
        direction: "ltr"
      };
    });
}

function renderPiece(container, piece) {
  if (piece?.kind !== "text" || !piece.text) return;

  const node = document.createElement("span");
  node.className = "piece";
  node.style.left = px(piece.x);
  node.style.top = px(piece.y);
  node.style.width = px(piece.width);
  node.style.height = px(piece.height);
  node.style.lineHeight = px(piece.height);
  applyTextPaint(node, piece);
  node.dir = piece.direction === "rtl" ? "rtl" : "ltr";
  appendHighlightedText(node, String(piece.text), currentSearch);
  container.append(node);
}

function applyTextPaint(node, piece) {
  setStyle(node, "fontFamily", piece?.fontFamily);
  setStyle(node, "fontSize", piece?.fontSize, px);
  setStyle(node, "letterSpacing", piece?.letterSpacing, px);
  setStyle(node, "fontWeight", piece?.fontWeight);
  setStyle(node, "fontStyle", piece?.fontStyle);
  setStyle(node, "color", piece?.color);
}

function appendHighlightedText(node, text, query) {
  if (!query) {
    node.append(document.createTextNode(text));
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
    (window.innerWidth - 56) / PAGE_WIDTH,
    (window.innerHeight - 56) / PAGE_HEIGHT,
    1.35
  );
  const shell = renderPageShell(page, scale);
  shell.style.position = "relative";
  shell.style.left = "0";
  shell.style.top = "0";
  zoomPageNode.style.width = px(PAGE_WIDTH * scale);
  zoomPageNode.style.height = px(PAGE_HEIGHT * scale);
  zoomPageNode.append(shell);
  updateZoomControls();
}

function closeZoom(event) {
  if (event && event.target !== zoomNode) return;
  zoomedPage = null;
  zoomNode.classList.remove("is-open");
  zoomNode.setAttribute("aria-hidden", "true");
  updateZoomSourceHighlight();
}

function openZoomByOffset(offset) {
  if (!zoomedPage || currentPages.length === 0) return;
  const index = Math.max(0, Math.min(currentPages.length - 1, Number(zoomedPage.index) + offset));
  openZoom(currentPages[index]);
}

function updateZoomControls() {
  if (!zoomedPage || currentPages.length === 0) {
    zoomPageLabel.textContent = "Page 1 / 1";
    zoomPrevButton.disabled = true;
    zoomNextButton.disabled = true;
    return;
  }
  const index = Number(zoomedPage.index);
  zoomPageLabel.textContent = `Page ${index + 1} / ${currentPages.length}`;
  zoomPrevButton.disabled = index <= 0;
  zoomNextButton.disabled = index >= currentPages.length - 1;
}

function updateZoomSourceHighlight() {
  for (const shell of wallNode.querySelectorAll(".page-shell")) {
    shell.classList.toggle(
      "is-zoom-source",
      !!zoomedPage && Number(shell.dataset.pageIndex) === Number(zoomedPage.index)
    );
  }
  updateZoomControls();
}

function updateSelectionReadout() {
  const selection = window.getSelection();
  const text = selection ? selection.toString().replace(/\s+/g, " ").trim() : "";
  selectionReadout.textContent = text ? truncate(text, 220) : "Nothing selected.";
}

function countOccurrencesByPage(pages, query) {
  const counts = new Map();
  if (!query) return counts;
  const lowerQuery = query.toLowerCase();
  for (const page of pages) {
    const lowerText = page.plainText.toLowerCase();
    let count = 0;
    let cursor = 0;
    while (true) {
      const index = lowerText.indexOf(lowerQuery, cursor);
      if (index < 0) break;
      count += 1;
      cursor = index + lowerQuery.length;
    }
    if (count > 0) {
      counts.set(page.index, count);
    }
  }
  return counts;
}

function collectPlainText(element) {
  if (!element || typeof element !== "object") return "";
  let text = typeof element.content === "string" ? element.content : "";
  for (const child of element.children || []) {
    text += collectPlainText(child);
  }
  return text;
}

function blockPlainText(block) {
  if (block.type === "table") {
    return (block.cells || []).map(cell => cell.text).join(" ");
  }
  return (block.runs || []).map(run => run.text).join("");
}

function setStatus() {
  if (!lastTimings) {
    statusNode.textContent = widowOrphanToggle.checked
      ? "Ready to paginate with DOM measurement and widow/orphan checks."
      : "Ready to paginate the sample with DOM measurement.";
    return;
  }
  const pieceCount = currentPages.reduce((sum, page) => sum + (page.pieces?.length || 0), 0);
  const mode = widowOrphanToggle.checked ? "DOM + W/O" : "DOM";
  statusNode.textContent =
    `${mode}: ${currentPages.length} pages | ${pieceCount} piece(s) | parse ${formatMs(lastTimings.parseMs)} | ` +
    `paginate ${formatMs(lastTimings.paginateMs)} | wall ${formatMs(lastTimings.renderMs)}`;
}

function truncate(text, maxLength) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function cloneDocument(source) {
  if (typeof structuredClone === "function") {
    return structuredClone(source);
  }
  return JSON.parse(JSON.stringify(source));
}

function normalizeDemoFontFamily(fontFamily) {
  const family = String(fontFamily || "").trim();
  if (!family || family === "Tinos") {
    return DEFAULT_FONT_FAMILY;
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

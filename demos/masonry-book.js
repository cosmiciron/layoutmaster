import { fit, form } from "@layoutmaster/layoutmaster";
import sampleDocument from "./assets/html-atlas-big-326-pages.js";

const MIN_CARD_WIDTH = 230;
const MAX_CARD_WIDTH = 320;
const CARD_GAP = 18;
const CARD_PADDING_X = 36;
const CARD_PADDING_TOP = 26;
const CARD_PADDING_BOTTOM = 26;
const TITLE_GAP = 12;
const BODY_FONT = 'Arial, sans-serif';
const TITLE_FONT = 'Georgia, "Times New Roman", serif';

const stageNode = document.getElementById("stage");
const wallNode = document.getElementById("wall");
const statusNode = document.getElementById("status");
const searchInput = document.getElementById("search-input");
const repeatSelect = document.getElementById("repeat-select");
const pieceFrameToggle = document.getElementById("piece-frame-toggle");

let sourceChapters = null;
let baseCards = [];
let currentCards = [];
let currentSearch = "";
let resizeFrame = 0;
let lastStageWidth = 0;
let runSequence = 0;

repeatSelect.addEventListener("change", () => resetDemo());
pieceFrameToggle.addEventListener("change", () => {
  wallNode.classList.toggle("show-piece-frames", pieceFrameToggle.checked);
});
searchInput.addEventListener("input", () => {
  currentSearch = searchInput.value.trim();
  renderLayoutmasterWall(currentCards);
});

new ResizeObserver(() => {
  const stageWidth = Math.round(stageNode.clientWidth);
  if (currentCards.length === 0
    || Math.abs(stageWidth - lastStageWidth) < 1) {
    return;
  }
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    lastStageWidth = Math.round(stageNode.clientWidth);
    runDemo(baseCards, "resize");
  });
}).observe(stageNode);

resetDemo();

async function resetDemo() {
  const chapters = await loadChapters();
  baseCards = repeatCards(chapters, Number(repeatSelect.value || 1));
  runDemo(baseCards);
}

function runDemo(cards = baseCards, statusPrefix = "") {
  const totalStartedAt = performance.now();
  const runId = ++runSequence;
  lastStageWidth = Math.round(stageNode.clientWidth);

  currentCards = cards;
  statusNode.textContent = "Solving cards with Layoutmaster...";

  requestAnimationFrame(() => {
    if (runId !== runSequence) return;
    renderLayoutmasterMode(cards, totalStartedAt, statusPrefix);
  });
}

function renderLayoutmasterMode(cards, totalStartedAt, statusPrefix = "") {
  const layout = resolveResponsiveLayout();
  const cached = createLayoutmasterSources(cards);
  const solvedCards = solveLayoutmasterCards(cached.cards, layout.cardWidth);
  const packedCards = packCards(solvedCards, layout);
  renderLayoutmasterWall(packedCards, layout);
  const wallHeight = Math.max(0, ...packedCards.map((card) => card.y + card.height));
  const totalMs = performance.now() - totalStartedAt;

  currentCards = packedCards;
  statusNode.textContent = [
    statusPrefix,
    "Layoutmaster pieces",
    `${cards.length} card(s)`,
    `${layout.columnCount} column(s)`,
    `unique ${cached.titleCount} title / ${cached.bodyCount} body`,
    `total ${formatMs(totalMs)}`,
    `wall ${Math.round(wallHeight)} px`
  ].filter(Boolean).join(" | ");
}

async function loadChapters() {
  if (sourceChapters) return sourceChapters;
  sourceChapters = extractChapters(sampleDocument.elements || []);
  return sourceChapters;
}

function extractChapters(elements) {
  const chapters = [];
  let current = null;
  for (const element of elements) {
    if (element.type === "chapter-heading") {
      if (current) chapters.push(current);
      current = {
        title: extractElementText(element) || `Chapter ${chapters.length + 1}`,
        paragraphs: []
      };
      continue;
    }
    if (!current || !String(element.type || "").startsWith("paragraph")) continue;
    const text = extractElementText(element).trim();
    if (text) current.paragraphs.push(text);
  }
  if (current) chapters.push(current);
  return chapters;
}

function repeatCards(chapters, repeat) {
  const cards = [];
  for (let copy = 0; copy < repeat; copy++) {
    for (const chapter of chapters) {
      cards.push({
        ...chapter,
        key: `${copy}:${chapter.title}`,
        title: repeat > 1 ? `${chapter.title} · ${copy + 1}` : chapter.title
      });
    }
  }
  return cards;
}

function createLayoutmasterSources(cards) {
  const titleSources = new Map();
  const bodySources = new Map();
  const cachedCards = cards.map((card) => {
    const bodyText = card.paragraphs.join("\n\n");
    let titleSource = titleSources.get(card.title);
    if (!titleSource) {
      titleSource = {
        text: card.title,
        cache: new Map(),
        options: {
          fontFamily: TITLE_FONT,
          fontSize: 18,
          lineHeight: 1.18,
          lineHeightMode: "css"
        }
      };
      titleSources.set(card.title, titleSource);
    }
    let bodySource = bodySources.get(bodyText);
    if (!bodySource) {
      bodySource = {
        text: bodyText,
        cache: new Map(),
        options: {
          height: 40000,
          fontFamily: BODY_FONT,
          fontSize: 12,
          lineHeight: 1.45,
          lineHeightMode: "css"
        }
      };
      bodySources.set(bodyText, bodySource);
    }
    return {
      ...card,
      titleSource,
      bodySource
    };
  });
  return {
    cards: cachedCards,
    titleCount: titleSources.size,
    bodyCount: bodySources.size
  };
}

function solveCached(source, mode, options) {
  const key = `${mode}:${JSON.stringify(options)}`;
  if (source.cache.has(key)) return source.cache.get(key);
  const result = mode === "form"
    ? form(source.text, {
        ...source.options,
        ...options
      })
    : fit(source.text, {
        ...source.options,
        ...options
      });
  source.cache.set(key, result);
  return result;
}

function solveLayoutmasterCards(cachedCards, cardWidth) {
  const contentWidth = cardWidth - CARD_PADDING_X;
  return cachedCards.map((card) => {
    const title = solveCached(card.titleSource, "form", { width: contentWidth });
    const body = solveCached(card.bodySource, "fit", { width: contentWidth });
    const bodyOffsetY = CARD_PADDING_TOP + title.height + TITLE_GAP;
    const pieces = [
      ...offsetPieces(title.pieces, CARD_PADDING_X / 2, CARD_PADDING_TOP),
      ...offsetPieces(body.pieces, CARD_PADDING_X / 2, bodyOffsetY)
    ];
    const height = Math.ceil(CARD_PADDING_TOP + title.height + TITLE_GAP + body.height + CARD_PADDING_BOTTOM);
    return {
      key: card.key,
      title: card.title,
      paragraphs: card.paragraphs,
      pieces,
      width: cardWidth,
      height
    };
  });
}

function offsetPieces(pieces, dx, dy) {
  return (pieces || []).map((piece) => ({
    ...piece,
    x: Number(piece.x || 0) + dx,
    y: Number(piece.y || 0) + dy,
    baselineY: Number.isFinite(Number(piece.baselineY))
      ? Number(piece.baselineY) + dy
      : piece.baselineY
  }));
}

function packCards(cards, layout) {
  const heights = Array.from({ length: layout.columnCount }, () => 0);
  return cards.map((card) => {
    let column = 0;
    for (let index = 1; index < heights.length; index++) {
      if (heights[index] < heights[column]) column = index;
    }
    const packed = {
      ...card,
      column,
      x: column * (layout.cardWidth + CARD_GAP),
      y: heights[column]
    };
    heights[column] += card.height + CARD_GAP;
    return packed;
  });
}

function renderLayoutmasterWall(cards, layout = resolveResponsiveLayout()) {
  if (!cards.length) return;
  const fragment = document.createDocumentFragment();
  const query = currentSearch.toLowerCase();
  let hitCount = 0;
  for (const card of cards) {
    const node = document.createElement("article");
    node.className = "card layoutmaster-card";
    node.style.width = px(card.width || layout.cardWidth);
    node.style.height = px(card.height);
    node.style.transform = `translate(${card.x}px, ${card.y}px)`;
    node.dataset.cardIndex = String(fragment.childNodes.length + 1);
    if (query && cardMatches(card, query)) {
      node.classList.add("has-search-hit");
      hitCount += 1;
    }
    for (const piece of card.pieces || []) {
      renderPiece(node, piece, query);
    }
    node.append(createCardMapLabel(fragment.childNodes.length + 1, {
      x: card.x,
      y: card.y,
      height: card.height
    }));
    fragment.append(node);
  }

  wallNode.className = "wall layoutmaster-wall";
  wallNode.classList.toggle("show-piece-frames", pieceFrameToggle.checked);
  wallNode.replaceChildren(fragment);
  wallNode.style.width = px(layout.columnCount * layout.cardWidth + Math.max(0, layout.columnCount - 1) * CARD_GAP);
  wallNode.style.height = px(Math.max(0, ...cards.map((card) => card.y + card.height)));
  stageNode.scrollLeft = 0;
  updateSearchHits(hitCount);
}

function createCardMapLabel(index, geometry) {
  const label = document.createElement("span");
  label.className = "card-map-label";
  label.textContent = `#${index} x${Math.round(geometry.x)} y${Math.round(geometry.y)} h${Math.round(geometry.height)}`;
  return label;
}

function renderPiece(container, piece, query = "") {
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
  appendHighlightedText(node, String(piece.text), query);
  container.append(node);
}

function resolveResponsiveLayout() {
  const available = Math.max(MIN_CARD_WIDTH, stageNode.clientWidth - 64);
  const columnCount = Math.max(1, Math.floor((available + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP)));
  const cardWidth = Math.min(MAX_CARD_WIDTH, Math.floor((available - (columnCount - 1) * CARD_GAP) / columnCount));
  return {
    available,
    columnCount,
    cardWidth
  };
}

function updateSearchHits(hitCount) {
  if (currentSearch) {
    statusNode.textContent = `${statusNode.textContent.split(" | hits")[0]} | hits ${hitCount}`;
  }
}

function appendHighlightedText(node, text, query) {
  if (!query) {
    node.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const index = lower.indexOf(query, cursor);
    if (index === -1) {
      node.append(document.createTextNode(text.slice(cursor)));
      break;
    }
    if (index > cursor) node.append(document.createTextNode(text.slice(cursor, index)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(index, index + query.length);
    node.append(mark);
    cursor = index + query.length;
  }
}

function cardMatches(card, query) {
  return card.title.toLowerCase().includes(query)
    || card.paragraphs.some((paragraph) => paragraph.toLowerCase().includes(query));
}

function extractElementText(element) {
  let text = typeof element.content === "string" ? element.content : "";
  if (Array.isArray(element.children)) {
    text += element.children.map(extractElementText).join("");
  }
  if (Array.isArray(element.slots)) {
    text += element.slots
      .flatMap((slot) => slot.elements || [])
      .map(extractElementText)
      .join("");
  }
  if (Array.isArray(element.zones)) {
    text += element.zones
      .flatMap((zone) => zone.elements || [])
      .map(extractElementText)
      .join("");
  }
  return text;
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

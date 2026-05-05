// Minimal reference piece renderer for the demos.
//
// HTML paints the text. SVG paints optional debug chrome. Both layers use only
// engine-returned piece geometry; the browser never reflows or remeasures text.

const SVG_NS = "http://www.w3.org/2000/svg";
const CHROME_LAYER_ATTRIBUTE = "data-layoutmaster-piece-chrome";

/**
 * Paint one returned text piece as an absolutely positioned HTML node.
 */
export function renderPiece(container, piece) {
  if (piece?.kind !== "text") {
    return null;
  }

  const metrics = resolveBaselineMetrics(piece);
  const node = document.createElement("div");
  node.className = "piece";
  node.style.left = px(piece.x);
  node.style.top = px(metrics?.top ?? piece.y);
  node.style.width = px(piece.width);
  node.style.height = px(metrics?.height ?? piece.height);
  node.style.lineHeight = px(metrics?.height ?? piece.height);
  node.style.padding = "0";
  node.style.boxSizing = "border-box";
  node.style.zIndex = "4";

  applyTextPaint(node, piece);
  const paintDirection = piece.lineDirection || piece.direction;
  if (paintDirection) {
    node.dir = paintDirection === "rtl" ? "rtl" : "ltr";
    node.style.direction = paintDirection === "rtl" ? "rtl" : "ltr";
  }

  const text = document.createElement("span");
  text.className = "piece-text";
  text.textContent = piece.visualText || piece.text || "";
  node.append(text);
  container.append(node);
  return node;
}

/**
 * Paint one piece's debug chrome into the same positioned HTML surface.
 *
 * The helper owns a single absolute SVG layer inside the container. The layer
 * uses the same coordinate space as the piece nodes, so rectangles and optional
 * baselines are literal drawings of the returned piece fields.
 */
export function renderPieceChrome(container, piece, options = {}) {
  const layer = ensureChromeLayer(container);
  const group = svg("g");
  group.classList.add("piece-chrome");

  const box = svg("rect");
  box.classList.add("piece-chrome-box");
  setNumberAttribute(box, "x", piece?.x);
  setNumberAttribute(box, "y", piece?.y);
  setNumberAttribute(box, "width", piece?.width);
  setNumberAttribute(box, "height", piece?.height);
  box.setAttribute("fill", "none");
  box.setAttribute("stroke", "rgba(112, 82, 57, 0.42)");
  box.setAttribute("stroke-dasharray", "4 3");
  box.setAttribute("vector-effect", "non-scaling-stroke");
  group.append(box);

  const baselineY = Number(piece?.baselineY);
  if (options.baseline && Number.isFinite(baselineY)) {
    const baseline = svg("line");
    baseline.classList.add("piece-chrome-baseline");
    setNumberAttribute(baseline, "x1", piece?.x);
    setNumberAttribute(baseline, "y1", baselineY);
    setNumberAttribute(baseline, "x2", Number(piece?.x || 0) + Number(piece?.width || 0));
    setNumberAttribute(baseline, "y2", baselineY);
    baseline.setAttribute("stroke", "rgba(132, 56, 39, 0.72)");
    baseline.setAttribute("vector-effect", "non-scaling-stroke");
    group.append(baseline);
  }

  layer.append(group);
  return group;
}

function ensureChromeLayer(container) {
  for (const child of container.children || []) {
    if (child.tagName?.toLowerCase() === "svg" && child.hasAttribute(CHROME_LAYER_ATTRIBUTE)) {
      return child;
    }
  }

  const layer = svg("svg");
  layer.setAttribute(CHROME_LAYER_ATTRIBUTE, "");
  layer.classList.add("piece-chrome-layer");
  layer.style.position = "absolute";
  layer.style.inset = "0";
  layer.style.width = "100%";
  layer.style.height = "100%";
  layer.style.overflow = "visible";
  layer.style.pointerEvents = "none";
  layer.style.zIndex = "3";
  container.prepend(layer);
  return layer;
}

function applyTextPaint(node, piece) {
  setStyle(node, "fontSize", piece.fontSize, px);
  setStyle(node, "fontFamily", piece.fontFamily);
  setStyle(node, "letterSpacing", piece.letterSpacing, px);
  setStyle(node, "fontWeight", piece.fontWeight);
  setStyle(node, "fontStyle", piece.fontStyle);
  setStyle(node, "color", piece.color);
}

function resolveBaselineMetrics(piece) {
  const baselineY = Number(piece?.baselineY);
  const fontSize = Number(piece?.fontSize);
  const ascent = Number(piece?.ascent);
  const descent = Number(piece?.descent);
  if (!Number.isFinite(baselineY)
    || !Number.isFinite(fontSize)
    || fontSize <= 0
    || !Number.isFinite(ascent)
    || ascent <= 0) {
    return null;
  }

  const ascentPx = (ascent / 1000) * fontSize;
  const descentPx = Number.isFinite(descent) && descent >= 0
    ? (descent / 1000) * fontSize
    : Math.max(0, Number(piece?.height || 0) - ascentPx);
  const height = Math.max(1, ascentPx + descentPx);
  return {
    top: baselineY - ascentPx,
    height
  };
}

function svg(tagName) {
  return document.createElementNS(SVG_NS, tagName);
}

function setNumberAttribute(node, name, value) {
  const numeric = Number(value);
  node.setAttribute(name, String(Number.isFinite(numeric) ? numeric : 0));
}

function setStyle(node, property, value, formatter = String) {
  if (value == null || value === "") return;
  node.style[property] = formatter(value);
}

function px(value) {
  const numeric = Number(value);
  return `${Number.isFinite(numeric) ? numeric : 0}px`;
}

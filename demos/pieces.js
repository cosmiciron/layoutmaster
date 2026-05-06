import {
  debugBuildHiddenDocument,
  form
} from "@layoutmaster/layoutmaster";

const content = JSON.stringify({
  elements: [
    {
      type: "p",
      content: "",
      properties: {
        sourceId: "stress-intro",
        style: {
          fontFamily: "Arial, 'Noto Sans', 'Noto Sans CJK SC', sans-serif",
          fontSize: 18,
          lineHeight: 1.32,
          color: "#3c3029"
        }
      },
      children: [
        {
          type: "text",
          content: "Pieces carry ",
          properties: {
            _tokenKind: "opening",
            style: {
              fontStyle: "italic",
              color: "#5a4b44",
              fontSize: 32
            }
          }
        },
        {
          type: "text",
          content: "self-contained",
          properties: {
            sourceId: "stress-claim",
            _role: "claim",
            _tokenKind: "claim",
            style: {
              fontWeight: "700",
              color: "#7a3527",
              fontSize: 20
            }
          }
        },
        {
          type: "text",
          content: " geometry, even when the line mixes ",
          properties: {
            _tokenKind: "body"
          }
        },
        {
          type: "text",
          content: "tiny",
          properties: {
            _tokenKind: "tiny",
            style: {
              fontSize: 10,
              letterSpacing: 0.4,
              color: "#6f6257"
            }
          }
        },
        {
          type: "text",
          content: " notes with ",
          properties: {
            _tokenKind: "body"
          }
        },
        {
          type: "text",
          content: "LOUD WORDS",
          properties: {
            _tokenKind: "shout",
            style: {
              fontSize: 42,
              fontWeight: "700",
              letterSpacing: -0.2,
              color: "#2f5e55"
            }
          }
        },
        {
          type: "text",
          content: "."
        }
      ]
    },
    {
      type: "p",
      content: "",
      properties: {
        sourceId: "stress-cjk",
        style: {
          fontFamily: "'Noto Sans CJK SC', 'Microsoft YaHei', Arial, sans-serif",
          fontSize: 19,
          lineHeight: 1.34,
          color: "#342b24",
          marginBottom: 12
        }
      },
      children: [
        {
          type: "text",
          content: "中文片段 ",
          properties: {
            _tokenKind: "cjk-label",
            style: {
              fontSize: 28,
              fontWeight: "700",
              color: "#6b3f27"
            }
          }
        },
        {
          type: "text",
          content: "和日本語のかな交じり文 should sit on the same returned baselines, ",
          properties: {
            _tokenKind: "cjk-body"
          }
        },
        {
          type: "text",
          content: "雨上がり",
          properties: {
            sourceId: "stress-japanese",
            _tokenKind: "jp-emphasis",
            style: {
              fontFamily: "'Noto Serif CJK JP', 'Yu Mincho', serif",
              fontSize: 34,
              fontWeight: "700",
              color: "#405f7a"
            }
          }
        },
        {
          type: "text",
          content: " included."
        }
      ]
    },
    {
      type: "p",
      content: "",
      properties: {
        sourceId: "stress-bidi",
        style: {
          fontFamily: "Arial, 'Noto Naskh Arabic', 'Noto Sans Hebrew', sans-serif",
          fontSize: 18,
          lineHeight: 1.36,
          color: "#302923",
          marginBottom: 0
        }
      },
      children: [
        {
          type: "text",
          content: "BIDI check: English before ",
          properties: {
            _tokenKind: "ltr"
          }
        },
        {
          type: "text",
          content: "עברית גדולה",
          properties: {
            sourceId: "stress-hebrew",
            _tokenKind: "hebrew",
            style: {
              direction: "rtl",
              fontSize: 30,
              fontWeight: "700",
              color: "#704066"
            }
          }
        },
        {
          type: "text",
          content: " and Arabic ",
          properties: {
            _tokenKind: "ltr"
          }
        },
        {
          type: "text",
          content: "مرحبا بالعالم",
          properties: {
            sourceId: "stress-arabic",
            _tokenKind: "arabic",
            style: {
              direction: "rtl",
              fontSize: 24,
              fontWeight: "700",
              color: "#8a4f2f"
            }
          }
        },
        {
          type: "text",
          content: " after punctuation and wrap pressure."
        }
      ]
    },
    {
      type: "p",
      content: "",
      properties: {
        sourceId: "stress-metrics",
        style: {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 17,
          lineHeight: 1.28,
          color: "#2d2824"
        }
      },
      children: [
        {
          type: "text",
          content: "A serif closer: "
        },
        {
          type: "text",
          content: "48px",
          properties: {
            _tokenKind: "metric-large",
            style: {
              fontSize: 48,
              fontWeight: "700",
              color: "#74453a"
            }
          }
        },
        {
          type: "text",
          content: " beside "
        },
        {
          type: "text",
          content: "9px",
          properties: {
            _tokenKind: "metric-small",
            style: {
              fontSize: 9,
              fontStyle: "italic",
              color: "#6f6257"
            }
          }
        },
        {
          type: "text",
          content: " should no longer bend the HTML baseline."
        }
      ]
    }
  ]
});

const options = {
  width: 520,
  fontFamily: "Arial, 'Noto Sans', sans-serif",
  fontSize: 18,
  lineHeight: 1.34
};

const surface = document.getElementById("surface");
const hiddenAstData = document.getElementById("hidden-ast-data");
const pieceData = document.getElementById("piece-data");
const showBoxesInput = document.getElementById("show-boxes");
const showBaselinesInput = document.getElementById("show-baselines");
const hiddenAst = debugBuildHiddenDocument(content, options, "form");
const result = form(content, options);
const SVG_NS = "http://www.w3.org/2000/svg";

hiddenAstData.textContent = JSON.stringify(hiddenAst, null, 2);
pieceData.textContent = JSON.stringify(result.pieces, null, 2);
showBoxesInput.addEventListener("change", render);
showBaselinesInput.addEventListener("change", render);
render();

function render() {
  renderSolvedPieces(surface, result.pieces, result.lines, result.height, {
    showBoxes: showBoxesInput.checked,
    showBaselines: showBaselinesInput.checked
  });
}

function renderSolvedPieces(container, solvedPieces, lines, height, chromeOptions) {
  const width = maxEdge(solvedPieces, "x", "width") + 32;
  const resolvedHeight = height || maxEdge(solvedPieces, "y", "height") + 32;
  container.replaceChildren();
  container.style.width = px(width);
  container.style.height = px(resolvedHeight);

  for (const piece of solvedPieces) {
    renderTextPiece(container, piece);
  }

  renderChrome(container, solvedPieces, lines, width, resolvedHeight, chromeOptions);
}

/**
 * Paint one returned text piece as one absolutely positioned HTML node.
 *
 * This is the whole point of the demo: the browser is only a paint target.
 * The piece supplies the layout box (`x`, `width`) and, for text, the engine
 * baseline plus font metrics (`baselineY`, `ascent`, `descent`). Those metrics
 * convert the engine baseline into an HTML top/height without asking CSS line
 * boxes to invent alignment for mixed font sizes.
 */
function renderTextPiece(container, piece) {
  if (piece?.kind !== "text") {
    return;
  }

  const metrics = resolveTextMetrics(piece);
  const node = document.createElement("div");
  node.className = "piece";
  node.style.left = px(piece.x);
  node.style.top = px(metrics.top);
  node.style.width = px(piece.width);
  node.style.height = px(metrics.height);
  node.style.lineHeight = px(metrics.height);
  node.style.padding = "0";
  node.style.boxSizing = "border-box";

  applyTextPaint(node, piece);

  const text = document.createElement("span");
  text.className = "piece-text";
  text.textContent = piece.text || "";
  node.append(text);
  container.append(node);
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

/**
 * Paint SVG inspection chrome over the HTML text.
 *
 * The dashed rectangles come from each returned piece's `x`, `y`, `width`, and
 * `height`. The red guides come from `result.lines[].baselineY`. Keeping this
 * layer in SVG makes the debug marks precise without mixing them into the DIV
 * text renderer or depending on browser layout measurements. The header
 * toggles only decide which already-returned geometry is visible.
 */
function renderChrome(container, solvedPieces, lines, width, height, chromeOptions) {
  const chrome = svgElement("svg");
  chrome.classList.add("piece-chrome");
  chrome.setAttribute("width", px(width));
  chrome.setAttribute("height", px(height));
  chrome.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (chromeOptions.showBoxes) {
    for (const piece of solvedPieces) {
      appendPieceBox(chrome, piece);
    }
  }

  if (chromeOptions.showBaselines) {
    for (const line of lines || []) {
      appendLineBaseline(chrome, line);
    }
  }

  container.append(chrome);
}

function appendPieceBox(svg, piece) {
  const box = svgElement("rect");
  box.classList.add("piece-box");
  box.setAttribute("x", numberAttr(piece.x));
  box.setAttribute("y", numberAttr(piece.y));
  box.setAttribute("width", numberAttr(piece.width));
  box.setAttribute("height", numberAttr(piece.height));
  svg.append(box);
}

function appendLineBaseline(svg, line) {
  const lineWidth = Number(line?.width || 0);
  const x = Number(line?.x || 0);
  const y = Number(line?.baselineY || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(lineWidth) || lineWidth <= 0) {
    return;
  }
  const baseline = svgElement("line");
  baseline.classList.add("piece-baseline");
  baseline.setAttribute("x1", numberAttr(x));
  baseline.setAttribute("y1", numberAttr(y));
  baseline.setAttribute("x2", numberAttr(x + lineWidth));
  baseline.setAttribute("y2", numberAttr(y));
  svg.append(baseline);
}

function maxEdge(items, startKey, sizeKey) {
  let max = 0;
  for (const item of items) {
    const edge = Number(item[startKey] || 0) + Number(item[sizeKey] || 0);
    if (Number.isFinite(edge) && edge > max) max = edge;
  }
  return max;
}

function px(value) {
  const numeric = Number(value);
  return `${Number.isFinite(numeric) ? numeric : 0}px`;
}

function setStyle(node, property, value, formatter = String) {
  if (value == null || value === "") return;
  node.style[property] = formatter(value);
}

function numberAttr(value) {
  const numeric = Number(value);
  return String(Number.isFinite(numeric) ? numeric : 0);
}

function svgElement(tagName) {
  return document.createElementNS(SVG_NS, tagName);
}

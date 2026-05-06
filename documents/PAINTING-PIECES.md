# Painting Pieces

Layoutmaster returns solved text fragments called `pieces`.

Painting with pieces is the central Layoutmaster move. It is a little different
from the usual web instinct, so it deserves a minute.

The usual path is: give text to the DOM, let the browser wrap it, then try to
reverse-engineer what happened. Layoutmaster flips that around. The engine lays
out the text first and hands you a list of small, exact paint instructions:
"put this text slice at this x/y, in this box, on this baseline, with these
paint fields." Your renderer does not need to be smart. It needs to be faithful.

In the house metaphor, this is more precise than a blueprint. A blueprint still
needs interpretation. Pieces are closer to job tickets coming out of the
foreman's clipboard: board A goes here, cut to this size, nail it at this mark.
Give those tickets to a basic-but-careful crew and you still get the house. In
UI terms, that crew might be HTML spans, canvas `fillText()`, SVG text, WebGL
glyphs, or a native view. They paint. The engine has already made the layout
decisions.

That is why the pattern feels powerful. You keep native surfaces and ordinary
interaction, but you stop asking the destination surface to be the source of
layout truth. Measurement libraries can tell you useful numbers. Pieces give
you the work order.

The rule worth taping to the monitor: use the engine-returned geometry. The
browser can paint glyphs. Canvas can paint glyphs. SVG can paint glyphs. None
of them need to re-decide where the glyphs go.

For field details, see [PIECE-CONTRACT.md](./PIECE-CONTRACT.md).

## The Rule

A piece already contains the layout answer:

- `x`
- `y`
- `width`
- `height`
- `baselineY`
- `text`
- BIDI fields like `direction`, `lineDirection`, `visualText`,
  `logicalSegmentIndex`, and `visualSegmentIndex`
- paint fields like `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`,
  `letterSpacing`, and `color`
- optional metrics like `ascent` and `descent`

Do not reflow, rewrap, align, or measure the text again to place it. That is how
one layout answer becomes two layout answers, and then everyone has a long
afternoon.

## Getting Pieces

`form()`, `fit()`, `flow()`, and `pour()` return pieces directly or by
placement. `produce()` returns pieces per page.

```js
import { form } from "@layoutmaster/layoutmaster";

const result = form("Pieces are layout results.", {
  width: 360,
  fontFamily: "Arial, sans-serif",
  fontSize: 18,
  lineHeight: 1.35
});

console.log(result.pieces);
```

Paginated documents look the same, just one level down:

```js
import { produce } from "@layoutmaster/layoutmaster";

const result = produce({
  elements: [
    { type: "p", content: "A document page is still painted from pieces." }
  ]
});

for (const page of result.pages) {
  console.log(page.index, page.width, page.height, page.pieces.length);
}
```

Structured content can carry styles and app metadata:

```js
const content = JSON.stringify({
  elements: [{
    type: "p",
    content: "",
    properties: {
      sourceId: "intro",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 18,
        lineHeight: 1.35,
        color: "#302923"
      }
    },
    children: [
      { type: "text", content: "Pieces are " },
      {
        type: "text",
        content: "self-contained",
        properties: {
          _tokenKind: "claim",
          style: {
            fontWeight: "700",
            fontSize: 28,
            color: "#7a3527"
          }
        }
      },
      { type: "text", content: " fragments." }
    ]
  }]
});

const result = form(content, { width: 360 });
```

The returned pieces are the thing to paint:

```js
for (const piece of result.pieces) {
  console.log(piece.text, piece.x, piece.y, piece.width, piece.height);
}
```

## HTML

The safe HTML pattern is one absolutely positioned element per returned text
piece. Normal inline flow is lovely for documents and dangerous for this job.
It will try to help. Politely decline.

```js
function paintPieces(container, pieces) {
  container.replaceChildren();
  container.style.position = "relative";

  for (const piece of pieces) {
    if (piece.kind !== "text") continue;
    container.append(paintTextPiece(piece));
  }
}

function paintTextPiece(piece) {
  const metrics = resolveHtmlTextMetrics(piece);
  const node = document.createElement("div");

  node.style.position = "absolute";
  node.style.left = px(piece.x);
  node.style.top = px(metrics.top);
  node.style.width = px(piece.width);
  node.style.height = px(metrics.height);
  node.style.lineHeight = px(metrics.height);
  node.style.padding = "0";
  node.style.boxSizing = "border-box";

  copyTextPaint(node, piece);

  const text = document.createElement("span");
  text.style.whiteSpace = "pre";
  text.textContent = piece.text;
  node.append(text);
  return node;
}
```

The important part is translating the engine baseline into an honest CSS box:

```js
function resolveHtmlTextMetrics(piece) {
  const baselineY = Number(piece.baselineY);
  const fontSize = Number(piece.fontSize);
  const ascent = Number(piece.ascent);
  const descent = Number(piece.descent);

  if (Number.isFinite(baselineY)
    && Number.isFinite(fontSize)
    && fontSize > 0
    && Number.isFinite(ascent)
    && ascent > 0) {
    const ascentPx = (ascent / 1000) * fontSize;
    const descentPx = Number.isFinite(descent) && descent >= 0
      ? (descent / 1000) * fontSize
      : Math.max(0, Number(piece.height || 0) - ascentPx);

    return {
      top: baselineY - ascentPx,
      height: Math.max(1, ascentPx + descentPx)
    };
  }

  return {
    top: Number(piece.y || 0),
    height: Math.max(1, Number(piece.height || 0))
  };
}

function copyTextPaint(node, piece) {
  setStyle(node, "fontFamily", piece.fontFamily);
  setStyle(node, "fontSize", piece.fontSize, px);
  setStyle(node, "letterSpacing", piece.letterSpacing, px);
  setStyle(node, "fontWeight", piece.fontWeight);
  setStyle(node, "fontStyle", piece.fontStyle);
  setStyle(node, "color", piece.color);
}

function setStyle(node, property, value, formatter = String) {
  if (value == null || value === "") return;
  node.style[property] = formatter(value);
}

function px(value) {
  const numeric = Number(value);
  return `${Number.isFinite(numeric) ? numeric : 0}px`;
}
```

Why bother with `baselineY`, `ascent`, and `descent`? Because mixed-size text,
CJK, Latin, RTL, and LTR can all share a line. Layoutmaster solved that baseline.
CSS defaults are not invited to solve it again.

For mixed-direction text, keep the renderer literal. Paint `piece.text` in the
returned box and do not add your own direction policy in the renderer. If the
punctuation looks strange, that is useful signal from the engine, not something
the HTML painter should quietly repair.

## Debug Chrome

Debug overlays should also come from returned data.

Piece box:

```js
function appendPieceBox(svg, piece) {
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(piece.x));
  rect.setAttribute("y", String(piece.y));
  rect.setAttribute("width", String(piece.width));
  rect.setAttribute("height", String(piece.height));
  svg.append(rect);
}
```

Line baseline:

```js
function appendLineBaseline(svg, line) {
  const guide = document.createElementNS("http://www.w3.org/2000/svg", "line");
  guide.setAttribute("x1", String(line.x));
  guide.setAttribute("y1", String(line.baselineY));
  guide.setAttribute("x2", String(line.x + line.width));
  guide.setAttribute("y2", String(line.baselineY));
  svg.append(guide);
}
```

Chrome is for inspection. It should never be used to repair or replace piece
geometry.

## Canvas

Canvas is refreshingly direct because `fillText()` can paint at a baseline:

```js
function paintPiecesToCanvas(ctx, pieces) {
  for (const piece of pieces) {
    if (piece.kind !== "text") continue;

    ctx.save();
    ctx.font = cssFont(piece);
    ctx.fillStyle = piece.color || "#000";
    ctx.textBaseline = "alphabetic";

    ctx.fillText(piece.text, piece.x, piece.baselineY);
    ctx.restore();
  }
}

function cssFont(piece) {
  const style = piece.fontStyle || "normal";
  const weight = piece.fontWeight || "400";
  const size = `${Number(piece.fontSize || 16)}px`;
  const family = piece.fontFamily || "sans-serif";
  return `${style} ${weight} ${size} ${family}`;
}
```

If the engine materializes letter-spaced text as smaller pieces, paint each
piece at its returned `x` and `baselineY`. Do not add another tracking loop on
top for fun. The engine already did the spacing work.

Canvas debug chrome is just as literal:

```js
for (const piece of pieces) {
  ctx.strokeRect(piece.x, piece.y, piece.width, piece.height);
}

for (const line of result.lines) {
  ctx.beginPath();
  ctx.moveTo(line.x, line.baselineY);
  ctx.lineTo(line.x + line.width, line.baselineY);
  ctx.stroke();
}
```

## Please Do Not

- Put all pieces into one normal paragraph and let the browser wrap them again.
- Compute new line breaks from `piece.text`.
- Measure DOM nodes and feed those measurements back into placement.
- Nudge `piece.y`, `piece.height`, or `baselineY` because a surface looks a bit
  different.

If the output looks wrong, inspect the input lowering, engine-returned pieces,
metrics, and paint path separately. It is slower than guessing, but it ages much
better.

## Reference Demos

`demos/pieces.html` is the minimal reference:

- left panel: hidden AST assembled from structured content
- middle panel: generated pieces
- right panel: HTML painted from pieces
- SVG chrome: piece boxes and line baselines copied from engine results

`demos/html-atlas.html` is the paginated reference. It calls `produce()` once,
then renders returned pages and pieces into a selectable, searchable atlas.
Zoom and thumbnails are UI. Page geometry stays engine-owned.

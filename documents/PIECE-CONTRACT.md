# Piece Contract

Pieces are the main thing Layoutmaster gives back.

`form()`, `fit()`, `flow()`, and `pour()` return pieces directly or by
placement. `produce()` returns them per page. A piece is an engine-authored text
fragment: where it goes, what it says, and what paint metadata came along for
the ride.

For practical painting examples, see
[PAINTING-PIECES.md](./PAINTING-PIECES.md).

## The Deal

A piece is not a DOM node, document node, scene graph object, component, image,
or secret mini-renderer. It is a text layout result.

If your surface needs an image, video, custom component, or other non-text
thing, render that yourself and pass matching geometry to Layoutmaster as an
exclusion or container. Do not smuggle it through `pieces`. The pieces have
enough responsibility already.

## Public Shape

```ts
interface LayoutmasterPiece {
  [key: string]: unknown;
  x: number;
  y: number;
  width: number;
  height: number;
  baselineY?: number;
  lineIndex: number;
  pieceIndex: number;
  kind: "text";
  text: string;
  direction?: "ltr" | "rtl" | string;
  fontFamily?: string;
  fontSize?: number;
  letterSpacing?: number;
  fontWeight?: string;
  fontStyle?: string;
  ascent?: number;
  descent?: number;
  color?: string;
  _sourceId?: string;
  _sourceStart?: number;
  _sourceEnd?: number;
}
```

Underscore fields may appear when structured content carries custom metadata.
Non-underscore rendering conveniences such as `backgroundColor`, `borderRadius`,
or `imageUrl` are not standard piece fields. If an app wants those, it can map
them from its own metadata while painting.

## Geometry

`x` and `y` are the top-left position of the text fragment in the solved
coordinate system.

`width` and `height` are the engine-resolved fragment bounds. They are not
browser measurements. The browser had its chance; this is the engine's answer.

`baselineY` is the baseline for the line that owns the piece. It is useful for
precise text painting and debug overlays.

`lineIndex` identifies the solved line inside the source engine box. It is not
guaranteed to be globally unique across every region or page.

`pieceIndex` is for stable inspection and debugging. Please do not build a tiny
layout theory on top of it.

## Text

`kind` is `"text"` for public pieces.

`text` is the exact text slice represented by this piece. Render that text
inside the returned box. Do not concatenate everything into a paragraph and ask
the browser to wrap it again unless you are deliberately testing how sadness is
made.

`direction` carries the resolved text direction when the engine publishes it.

## Paint

Paint fields come from engine-resolved text style:

- `fontFamily`
- `fontSize`
- `letterSpacing`
- `fontWeight`
- `fontStyle`
- `color`

Copy them when painting. Avoid replacing them from outside options, because
different paint metrics can make the rendered text disagree with the solved
layout.

If a piece lacks a paint field, your renderer can fall back to local defaults.
That is an app choice, not new layout data.

## Metrics

`ascent` and `descent`, when present, are font metrics where `1000` equals
`1em`. Together with `baselineY`, they let HTML renderers place text by the same
baseline the engine used.

```js
const ascentPx = (piece.ascent / 1000) * piece.fontSize;
const descentPx = (piece.descent / 1000) * piece.fontSize;

node.style.top = `${piece.baselineY - ascentPx}px`;
node.style.height = `${ascentPx + descentPx}px`;
node.style.lineHeight = `${ascentPx + descentPx}px`;
```

That keeps mixed-size runs on one engine baseline instead of letting CSS invent
a fresh line box.

## Source Mapping

`_sourceId`, `_sourceStart`, and `_sourceEnd` map a piece back to authored text.

They are useful for:

- selection
- highlighting
- diagnostics
- editor integrations
- source inspection

They are not layout inputs.

## Lines Versus Pieces

`result.lines` gives line-level geometry. For `produce()`, use `page.lines`.

`result.pieces` gives text-fragment geometry. For `produce()`, use
`page.pieces`.

Line guides are great for overlays, carets, and diagnostics. They do not replace
pieces, and pieces should not derive new line geometry in wrapper or demo code.

## Custom Metadata

Structured content can attach app metadata under underscore-prefixed properties:
`_highlight`, `_tokenType`, `_cardId`, `_tooltip`, and friends.

```js
const content = JSON.stringify({
  elements: [{
    type: "p",
    content: "",
    children: [{
      type: "text",
      content: "Important",
      properties: {
        _highlight: "warm",
        _tokenType: "keyword",
        style: { fontWeight: "700" }
      }
    }]
  }]
});
```

Returned pieces for that text may include:

```js
{
  text: "Important",
  x: 0,
  y: 0,
  width: 82,
  height: 24,
  fontWeight: "700",
  _highlight: "warm",
  _tokenType: "keyword"
}
```

Use metadata for app behavior: annotations, tooltips, semantic tags, editor
state. Do not use it to override `x`, `y`, `width`, `height`, or `baselineY`.

## Tiny Renderer

The smallest honest HTML renderer is very literal:

```js
function renderPiece(piece) {
  const node = document.createElement("span");
  const ascentPx = (piece.ascent / 1000) * piece.fontSize;
  const descentPx = (piece.descent / 1000) * piece.fontSize;

  node.style.position = "absolute";
  node.style.left = `${piece.x}px`;
  node.style.top = `${piece.baselineY - ascentPx}px`;
  node.style.width = `${piece.width}px`;
  node.style.height = `${ascentPx + descentPx}px`;
  node.style.lineHeight = `${ascentPx + descentPx}px`;
  node.textContent = piece.text;
  return node;
}
```

Real renderers can use different elements or surfaces. The rule stays the same:
copy engine-authored geometry and text; do not recreate layout downstream.

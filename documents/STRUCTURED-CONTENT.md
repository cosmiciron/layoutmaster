# Structured Content

For `form()`, `fit()`, `flow()`, and `pour()`, content is a string.

Most strings are plain text. If the string contains Layoutmaster's small structured
JSON shape, it becomes mixed-style text. Still a string, still explicit, still
not the DOM sneaking in through a side door.

```json
{
  "elements": [
    {
      "type": "p",
      "content": "",
      "children": [
        { "type": "text", "content": "Hello " },
        {
          "type": "text",
          "content": "world",
          "properties": {
            "style": { "fontWeight": "700" }
          }
        }
      ]
    }
  ]
}
```

## Shape

The public shape is intentionally small:

- top-level object with `elements`
- `elements` is an array of text-bearing blocks
- each element may have `type`, `content`, `children`, and `properties`
- text leaves use `type: "text"` and `content`
- style and source metadata live under `properties`

This is here to make mixed-style text practical. It is not a grand universal
document format. No tiny throne has been built for it.

## Styles

Put text style under `properties.style`:

```js
const content = JSON.stringify({
  elements: [{
    type: "p",
    content: "",
    properties: {
      style: {
        fontFamily: "Georgia",
        fontSize: 18,
        lineHeight: 1.45,
        color: "#2f2a24"
      }
    },
    children: [
      { type: "text", content: "A little " },
      {
        type: "text",
        content: "emphasis",
        properties: {
          style: { fontWeight: "700", fontStyle: "italic" }
        }
      }
    ]
  }]
});
```

The engine uses those styles while laying out text. Returned pieces may carry
the resolved paint fields, such as:

- `fontFamily`
- `fontSize`
- `letterSpacing`
- `fontWeight`
- `fontStyle`
- `color`
- `direction`
- `lineDirection`
- `visualText`

A renderer should copy geometry and paint fields while painting. Directional
fields are engine diagnostics; do not use them to add a second BIDI policy in
the renderer.

## Custom Metadata

Custom metadata is for connecting returned pieces back to your app: editor
state, annotations, semantic roles, source IDs, tooltips, and similar useful
bits.

The recommended pattern:

1. Put stable source identity in `properties.sourceId`.
2. Put app metadata in underscore fields like `_tokenKind`, `_role`,
   `_annotationId`, or `_tooltip`.
3. Render returned pieces from engine-owned geometry.
4. Read those underscore fields while painting or handling interaction.

```js
const content = JSON.stringify({
  elements: [
    {
      type: "p",
      content: "",
      properties: {
        sourceId: "intro",
        style: { fontFamily: "Georgia", fontSize: 18 }
      },
      children: [
        {
          type: "text",
          content: "Important",
          properties: {
            sourceId: "intro-emphasis",
            _annotationId: "note-17",
            _tokenType: "keyword",
            style: { fontWeight: "700" }
          }
        },
        { type: "text", content: " text can carry source metadata." }
      ]
    }
  ]
});

const result = form(content, { width: 320 });

for (const piece of result.pieces) {
  const node = document.createElement("span");
  node.style.position = "absolute";
  node.style.left = `${piece.x}px`;
  node.style.top = `${piece.y}px`;
  node.style.width = `${piece.width}px`;
  node.style.height = `${piece.height}px`;
  node.textContent = piece.text || "";

  if (piece._annotationId) {
    node.dataset.annotationId = piece._annotationId;
  }
}
```

Good metadata uses:

- source IDs for cursor, selection, highlight, and inspection tools
- semantic tags like `_role`, `_kind`, or `_tokenType`
- application IDs like `_cardId` or `_annotationId`

Metadata is not a second layout system. It should not ask a renderer to split,
merge, reflow, resize, or nudge pieces into looking nicer. If the geometry is
wrong, inspect the input and the engine output; do not teach metadata to do
acrobatics.

## Metrics

Mixed-size text may return `baselineY`, `ascent`, and `descent`. HTML renderers
should use those with the returned piece geometry. CSS line boxes are useful in
normal documents, but here they are not the layout authority.

## Adapter Boundary

Helpers or app code may turn friendlier authoring formats into structured
content strings. That is fine.

Layoutmaster does not currently ship an HTML/DOM lowering helper. When one exists,
it should still return this explicit shape. The adapter can be friendly; the
core contract stays boring in the best possible way.

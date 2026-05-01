# API Reference

This is the public surface `layoutmaster` supports today.

The theme is simple: give Layoutmaster explicit content and constraints; get back
engine-authored layout data. No renderer, no hidden DOM layout bargain, no
"trust me, it looked right on my laptop."

Browser image sampling, video extraction, and HTML painting helpers live under
`demos/helpers`. They are useful source, not package exports.

Current clean build footprint:

- npm tarball: about 245 KiB
- unpacked package: about 1.29 MiB across 18 files
- shipped runtime JavaScript: about 1.11 MiB raw, 213 KiB gzip, 164 KiB Brotli
- type declarations: about 175 KiB raw, 30 KiB gzip

## Runtime

Layoutmaster is headless in the sense that it does not render UI and does not own a
view tree. The current runtime still needs browser text measurement APIs.
Layout calls require Canvas text measurement, either through `OffscreenCanvas`
or a DOM-created canvas. CSS baseline probing also uses browser DOM APIs when
needed.

Importing the package in plain Node works. Calling the layout APIs in plain Node
without browser canvas APIs throws `[layoutmaster] Browser canvas APIs are
unavailable.`

## Import

```js
import {
  form,
  fit,
  flow,
  pour,
  produce,
  exclusion,
  debugBuildHiddenDocument
} from "@layoutmaster/layoutmaster";
```

`debugBuildHiddenDocument()` is mostly for people working on Layoutmaster itself.
It is handy when you need to inspect what the wrapper handed to the engine.

## Content Inputs

`form()`, `fit()`, `flow()`, and `pour()` take string content.

Most strings are plain text. If the string is structured JSON, Layoutmaster treats
it as mixed-style text:

```js
const content = JSON.stringify({
  elements: [
    {
      type: "p",
      content: "",
      children: [
        { type: "text", content: "Hello " },
        {
          type: "text",
          content: "world",
          properties: { style: { fontWeight: "700" } }
        }
      ]
    }
  ]
});

const result = form(content, { width: 320 });
```

Raw HTML strings and DOM nodes are not core inputs. That is deliberate. HTML can
be lowered by an adapter later, but core wants explicit content, not a browser
node doing interpretive dance.

See [STRUCTURED-CONTENT.md](./STRUCTURED-CONTENT.md) for the structured shape.

## `form(content?, options?, handler?)`

Use `form()` when you have a width and want to know how the text lays out, plus
how tall it ended up.

```js
const result = form("Hello world", {
  width: 320,
  fontSize: 16,
  lineHeight: 1.4
});

console.log(result.height);
console.log(result.pieces);
```

```ts
interface FormResult {
  pieces: LayoutmasterPiece[];
  lines: LayoutmasterLineGuide[];
  height: number;
  performance: LayoutmasterPerformance;
}
```

`form()` uses an open internal height. It is the "how tall would this be?"
function.

## `fit(content?, options?, handler?)`

Use `fit()` when the box has a real height and overflow matters.

```js
const result = fit("Hello world", {
  width: 320,
  height: 180,
  fontSize: 16,
  lineHeight: 1.4
});

console.log(result.content.complete);
console.log(result.content.remaining.text);
```

```ts
interface FitResult {
  pieces: LayoutmasterPiece[];
  lines: LayoutmasterLineGuide[];
  height: number;
  content: LayoutmasterContentReport;
  performance: LayoutmasterPerformance;
}
```

`height` is the occupied height inside the bounded target. It stays at or below
the requested height, and reaches the requested height when text overflows.

## `flow(content?, targets?, handler?)`

Use `flow()` when content needs to continue through several boxes.

```js
const result = flow(text, [
  { width: 300, height: 500 },
  { width: 300, height: 500 }
]);

for (const placement of result.placements) {
  console.log(placement.index, placement.content.consumed.text);
}
```

```ts
interface FlowPlacement {
  index: number;
  pieces: LayoutmasterPiece[];
  lines: LayoutmasterLineGuide[];
  height: number;
  content: LayoutmasterContentReport;
}

interface FlowResult {
  placements: FlowPlacement[];
  content: LayoutmasterContentReport;
  performance: LayoutmasterPerformance;
}
```

For structured text JSON, the first placement uses the original structured
source. Later placements continue from the authored text report. It is
pragmatic, not magical.

## `pour(content?, shape, options?, handler?)`

Use `pour()` when text should live inside a shape instead of merely avoiding it.

```js
const vase = exclusion.circle({ x: 100, y: 50, radius: 120 });
const result = pour(text, vase, {
  fontFamily: "Georgia, serif",
  fontSize: 18,
  lineHeight: 1.35
});
```

```ts
interface PourResult {
  pieces: LayoutmasterPiece[];
  lines: LayoutmasterLineGuide[];
  height: number;
  content: LayoutmasterContentReport;
  performance: LayoutmasterPerformance;
}
```

The shape is the container. The returned pieces are still normal text pieces,
just solved inside that geometry.

## `produce(source, options?, handler?)`

Use `produce()` when you want pages.

This is the API behind the HTML Atlas demo: one engine run, many returned pages,
each with its own pieces and line guides.

Accepted sources:

- a full document object with `layout` and `elements`
- an object with `elements`
- an array of elements
- a JSON string containing any of those

Full document input:

```js
const result = produce({
  documentVersion: "1.1",
  layout: {
    pageSize: { width: 612, height: 792 },
    margins: { top: 72, right: 72, bottom: 72, left: 72 },
    fontFamily: "Georgia",
    fontSize: 16,
    lineHeight: 1.4
  },
  elements: [
    { type: "p", content: "A page-aware document." }
  ]
});
```

Elements-only input:

```js
const result = produce({
  elements: [
    { type: "p", content: "Structured elements can be paginated too." }
  ]
}, {
  width: 612,
  height: 792,
  margins: { top: 72, right: 72, bottom: 72, left: 72 }
});
```

```ts
interface ProducePage {
  index: number;
  width: number;
  height: number;
  occupiedHeight: number;
  pieces: LayoutmasterPiece[];
  lines: LayoutmasterLineGuide[];
}

interface ProduceResult {
  pages: ProducePage[];
  performance: LayoutmasterPerformance;
}
```

Render `page.pieces`. Inspect `page.lines`. Do not re-paginate in the browser
unless you enjoy maintaining two layout engines and explaining why they disagree.

## Options

All layout calls accept plain option objects:

```ts
interface LayoutmasterRequest {
  width?: number | string;
  height?: number | string;
  format?: "plain";
  fontFamily?: string;
  fontSize?: number | string;
  lineHeight?: number | string;
  lineHeightMode?: "print" | "css" | "browser";
  lineHeightAdjustment?: number | string;
  hyphenation?: "off" | "auto" | "soft";
  margins?: {
    top?: number | string;
    right?: number | string;
    bottom?: number | string;
    left?: number | string;
  };
  styles?: Record<string, Record<string, unknown>>;
  exclusions?: LayoutmasterExclusion[];
}
```

Defaults:

- `width`: `1`
- `fontFamily`: `"Times New Roman"`
- `fontSize`: `16`
- `lineHeight`: `1.4`
- `lineHeightMode`: `"css"`; `"browser"` aliases to `"css"`
- `hyphenation`: `"off"`
- `margins`: all `0`
- `exclusions`: `[]`

`fit()`, `flow()`, and `pour()` need bounded height after normalization.
`form()` does not.

For elements-only `produce()` calls, Layoutmaster starts from letter-page defaults:
`612 x 792` with `72` point margins, then applies your options.

## Exclusions

Exclusions are reusable geometry assets. Use them as obstacles for `form()` and
`fit()`, or as containers for `pour()`.

```js
const avatar = exclusion.circle({ x: 24, y: 12, radius: 40 });
const badge = exclusion.rect({ x: 180, y: 20, width: 64, height: 32 });

form(text, {
  width: 320,
  exclusions: [avatar, badge]
});
```

Builders:

```js
exclusion.circle({ x, y, radius, gap });
exclusion.rect({ x, y, width, height, gap });
exclusion.ellipse({ x, y, width, height, gap });
exclusion.polygon({ x, y, points, gap });
exclusion.assembly({ x, y, width, height, parts, members, layers, gap });
exclusion.fromAlphaChannel(alpha, width, height, options);
exclusion.fromJSON(savedData, options);
```

`exclusion.assembly(...)` is the manual primitive-composition builder. Use it
when a character, mascot, diagram, or rig is easier to describe as several crude
lobes than as one exact outline:

```js
const stickMan = exclusion.assembly({
  x: 90,
  y: 30,
  parts: [
    { kind: "circle", x: 42, y: 0, radius: 18 },
    { kind: "rect", x: 56, y: 36, width: 8, height: 58 },
    { kind: "capsule", x: 60, y: 48, length: 46, angle: -35, thickness: 8 }
  ],
  gap: 3
});
```

`parts` accepts `rect`, `circle`, `ellipse`, `polygon`, `line`, and `capsule`.
`line` and `capsule` are authoring conveniences that lower to polygon members
before layout. Low-level VMPrint style `members` and compact `layers` are also
accepted for replay and generated data.

Line and capsule parts can be described with explicit endpoints:

```js
{ kind: "capsule", x1: 24, y1: 48, x2: 96, y2: 68, thickness: 10 }
```

or with an origin, length, and angle in degrees:

```js
{ kind: "line", x: 24, y: 48, length: 72, angle: 18, thickness: 6 }
```

They are useful for limbs, connectors, rods, arrows, and other rotated pieces
without adding rotation support to the engine collider primitives.

Alpha assemblies can be serialized with `toJSON()`, replayed with
`exclusion.fromJSON(...)`, and previewed with `assembly.preview({ scale })`.

Browser image decoding lives in the helper shelf:

```js
import { helpers } from "./demos/helpers/helpers.js";

const mask = await helpers.imageToExclusion("/mask.png", {
  x: 40,
  y: 20,
  width: 180,
  height: 220,
  bandHeight: 4,
  tiers: 3,
  gap: 8
});

form(text, { width: 520, exclusions: [mask] });
```

## Pieces

Pieces are what you usually paint:

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

The important bit: `x`, `y`, `width`, `height`, and `baselineY` are engine
answers. Treat them as layout truth. Paint fields help you draw text with the
same metrics the engine used. Underscore fields are for source mapping and app
metadata.

See [PIECE-CONTRACT.md](./PIECE-CONTRACT.md) and
[PAINTING-PIECES.md](./PAINTING-PIECES.md).

## Line Guides

Line guides are useful for debug overlays, carets, and inspection:

```ts
interface LayoutmasterLineGuide {
  x: number;
  y: number;
  width: number;
  height: number;
  baselineY: number;
  lineIndex: number;
  direction?: "ltr" | "rtl" | string;
}
```

They are guides, not a suggestion to recompute piece geometry.

## Continuation Reports

Bounded APIs return a content report:

```ts
interface LayoutmasterContentReport {
  consumed: { text: string; length: number };
  remaining: { text: string; length: number };
  complete: boolean;
  hyphenated: boolean;
  sourceLength: number;
}
```

Use this report to drive the next target or update UI. Do not guess from the
rendered DOM. The DOM has many talents; being your continuation oracle is not
one of them.

## Performance

Every layout call returns an engine-native performance summary:

```ts
interface LayoutmasterPerformance {
  layoutMs: number;
  materializeMs: number;
  resolveLinesMs: number;
  buildTokensMs: number;
  wrapStreamMs: number;
  bidiMs: number;
  scriptSplitMs: number;
  wordSegmentMs: number;
  actorMeasurementMs: number;
  actorPlacementMs: number;
  actorOverflowMs: number;
  textMeasurementCacheHits: number;
  textMeasurementCacheMisses: number;
  colliderFieldQueryCalls: number;
  colliderFieldNarrowphaseCalls: number;
}
```

These are engine profile fields, not wrapper wall-clock timing. `flow()` adds
them up across placements.

## Helpers

The helper shelf lives in `demos/helpers`:

- `helpers.js`: one namespace for the helpers
- `pieces-to-html.js`: paint returned pieces into positioned HTML
- `image-to-exclusion.js`: turn browser image alpha into exclusions
- `video-to-dance-frames.js`: extract video silhouettes for the Dancing Text demo

See [HELPERS.md](./HELPERS.md).

## Handler Argument

Every top-level layout function accepts an optional handler. It receives the
same result the function returns:

```js
const result = form("Hello", { width: 200 }, (nextResult) => {
  console.log(nextResult.pieces.length);
});
```

The APIs are synchronous. The handler is just a convenience for callback-shaped
code.

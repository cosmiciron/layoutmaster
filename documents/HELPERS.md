# Helpers

Layoutmaster keeps the package API small on purpose. Core does layout. Helpers do
the surrounding practical chores: paint pieces, sample images, extract video
frames, and generally make the demos less ascetic.

The helper files live under [`demos/helpers`](../demos/helpers). They are
official examples and useful starting points, but they are not package exports
and they are not included in the npm tarball.

Copy them into your app when they help. Change them when your app needs
different defaults. They are source, not scripture.

## Why They Are Not In Core

Some workflows are valuable but browser-shaped:

- painting solved pieces into HTML
- painting paginated `produce()` results into a page surface
- sampling image alpha through canvas
- extracting animated exclusion frames from video

Those are real product workflows, but they are adapters around the layout
engine. Keeping them as source avoids making every install pay for browser-only
code or one demo's rendering opinions.

The rule:

- core owns layout solving
- helpers prepare explicit inputs or paint returned results
- helpers do not invent layout geometry

Layoutmaster does not currently ship an HTML/DOM lowering helper. If one arrives,
it should still produce explicit Layoutmaster input. The DOM may help author the
meal; it does not get to season the layout behind our backs.

## Copying And Imports

In this repo, demos import helpers from `./helpers/...`.

In an app, copy the files you need and adjust imports. For example,
`image-to-exclusion.js` imports core like this in the repo:

```js
import { exclusion } from "../../src/index.js";
```

After copying into an app, it usually becomes:

```js
import { exclusion } from "@layoutmaster/layoutmaster";
```

The files are meant to be small enough to own locally. If you need a React
renderer, different image sampling defaults, or custom UI wiring, edit the
copied helper. That is the intended path.

## Helper Namespace

`helpers.js` gathers the leaf helpers behind one readable import:

```js
import { helpers } from "./helpers/helpers.js";
import { form } from "@layoutmaster/layoutmaster";

const result = form("Hello world", { width: 420 });

surface.replaceChildren();
for (const piece of result.pieces) {
  helpers.renderPiece(surface, piece);
}
```

Current namespace:

- `helpers.renderPiece(...)`
- `helpers.renderPieceChrome(...)`
- `helpers.imageToExclusion(...)`
- `helpers.extractDanceFramesFromVideoFile(...)`

The leaf modules are still importable directly.

## Helper Contract

Helpers should:

- be copyable JavaScript source
- use public Layoutmaster APIs
- depend on browser APIs only when the job is browser-specific
- expose a small number of obvious functions
- adapt explicit inputs or paint returned outputs

Helpers should not:

- duplicate layout decisions
- measure DOM and treat it as layout truth
- replace `piece.x`, `piece.y`, `piece.width`, `piece.height`, or
  `piece.baselineY`

If a helper needs placement data, it should use engine-returned fields or
serialized exclusion data from core.

## `pieces-to-html.js`

This helper paints returned pieces into absolutely positioned HTML nodes and can
draw SVG debug chrome.

Use:

- `helpers.renderPiece(container, piece)`
- `helpers.renderPieceChrome(container, piece, options)`

Basic paint:

```js
import { form } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";

const result = form(text, {
  width: 420,
  fontFamily: "Georgia, serif",
  fontSize: 18,
  lineHeight: 1.4
});

surface.replaceChildren();
for (const piece of result.pieces) {
  helpers.renderPiece(surface, piece);
}
```

With chrome:

```js
surface.replaceChildren();
for (const piece of result.pieces) {
  helpers.renderPieceChrome(surface, piece, { baseline: true });
  helpers.renderPiece(surface, piece);
}
```

Chrome uses `piece.x`, `piece.y`, `piece.width`, `piece.height`, and optionally
`piece.baselineY`. It is a debug overlay, not a geometry repair kit.

## `image-to-exclusion.js`

This helper samples an image's alpha channel in the browser and returns a normal
Layoutmaster exclusion assembly.

```ts
async function imageToExclusion(
  source: string | HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  options?: ImageToExclusionOptions
): Promise<LayoutmasterExclusionAssembly>;
```

Accepted sources:

- image URL string
- `HTMLImageElement`
- `HTMLCanvasElement`
- `ImageBitmap`

Options:

```ts
{
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  bandHeight?: number;
  tiers?: 1 | 2 | 3 | 4;
  gap?: number;
}
```

Return value:

- usable in `form(..., { exclusions: [assembly] })`
- usable as the shape argument to `pour(...)`
- serializable with `assembly.toJSON()`
- replayable with `exclusion.fromJSON(...)`
- previewable with `assembly.preview({ scale })`

Example:

```js
import { form } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";

const mask = await helpers.imageToExclusion("/mask.png", {
  x: 40,
  y: 20,
  width: 180,
  height: 220,
  bandHeight: 4,
  tiers: 3,
  gap: 8
});

const result = form(text, {
  width: 520,
  exclusions: [mask]
});
```

Pouring into the same kind of shape:

```js
import { pour } from "@layoutmaster/layoutmaster";
import { helpers } from "./helpers/helpers.js";

const container = await helpers.imageToExclusion("/silhouette.png", {
  width: 260,
  height: 320,
  bandHeight: 1,
  tiers: 1
});

const result = pour(text, container, {
  fontSize: 18,
  lineHeight: 1.35
});
```

Replay without the original image:

```js
import { exclusion } from "@layoutmaster/layoutmaster";

const saved = mask.toJSON();
localStorage.setItem("mask", JSON.stringify(saved));

const loaded = JSON.parse(localStorage.getItem("mask"));
const replayed = exclusion.fromJSON(loaded, {
  x: 40,
  y: 20,
  gap: 8
});
```

Core owns portable assembly creation and replay. The helper owns browser image
decode, canvas draw, and alpha extraction. Nice clean division. Everyone keeps
their desk tidy.

## `video-to-dance-frames.js`

This helper extracts sampled video silhouettes for the Dancing Text demo.

It is the most demo-shaped helper in the shelf, but it is a useful reference
for animated layout fields:

- decode browser media
- create alpha masks
- convert masks to exclusion assemblies
- replay assemblies through `form(...)` or `pour(...)`

```ts
async function extractDanceFramesFromVideoFile(
  file: File,
  options: DanceFrameOptions
): Promise<DanceFrame[] | null>;
```

Common options:

```ts
{
  sampleFps: number;
  targetHeight: number;
  bandHeight: number;
  tiers: 1 | 2 | 3 | 4;
  gap: number;
  deltaThreshold: number;
  isCancelled?: () => boolean;
  onProgress?: (progress) => void;
}
```

Return value:

```ts
Array<{
  id: string;
  label: string;
  timestamp: number;
  width: number;
  height: number;
  imageUrl: string;
  formPreviewUrl: string;
  formAssemblyJson: object;
}>
```

If `options.isCancelled()` returns true during extraction, the helper returns
`null`.

Extraction:

```js
import { helpers } from "./helpers/helpers.js";

const frames = await helpers.extractDanceFramesFromVideoFile(file, {
  sampleFps: 6,
  targetHeight: 360,
  bandHeight: 3,
  tiers: 3,
  gap: 4,
  deltaThreshold: 0.08,
  isCancelled: () => cancelled,
  onProgress: ({ sampledCount, keptCount, totalCount }) => {
    console.log({ sampledCount, keptCount, totalCount });
  }
});
```

Replay:

```js
import { exclusion, form } from "@layoutmaster/layoutmaster";

const frame = frames[0];
const shape = exclusion.fromJSON(frame.formAssemblyJson, {
  x: 80,
  y: 30
});

const result = form(text, {
  width: 760,
  exclusions: [shape]
});
```

The extracted frame image is presentation. The JSON assembly drives layout.

## Promotion Rule

A helper belongs in core only when it becomes part of the portable layout
contract.

If it needs DOM, canvas, media decoding, HTML parsing, or app-specific painting,
it belongs in the helper shelf. That keeps core small while still making the fun
advanced workflows visible and easy to borrow.

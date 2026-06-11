# Layoutmaster

Every time you ask the DOM a layout question, it has to render that layout **before**
it can answer. It's like *committing a crime while you're still contemplating it*.

Ask too often and too fast (you will), **DR. DOM** will punish you, thrash your layout, 
crash your browser, and make your life miserable. 

Very miserable.

![Dr. DOM — The Tyrant of Terrible Layouts, versus Layoutmaster](https://raw.githubusercontent.com/cosmiciron/layoutmaster/main/demos/assets/dr-dom.png)

When that happens, Layoutmaster will be your hero. It will come to your browser's rescue. 
Beating at its heart is a microkernel-driven layout engine that's so fast and so versatile,
it can power an entire city. And it lets you do layout without paying taxes to DR. DOM ever 
again.

And you can do this as many times as you want, as fast as you want.

How fast? Picture this:
 
- 320,000 words. 
- Four novels back to back.
- A MASSIVE **343,912px**, 50-story high masonry wall.

This is the stuff that makes your new MacBook Pro M5 secretly weep behind its shiny armor. 
Yet the master casually lays it out in just...

**882ms**

on a... 

**Base Pixel 10 phone!**

*BAM!*

## See the Master in Action

### Dancing Text

<a href="https://layoutmaster.dev/demo.mp4">
   <img src="https://raw.githubusercontent.com/cosmiciron/layoutmaster/main/demos/assets/video-cover.png"
     alt="Layoutmaster dancing text demo: live text layout wrapping around animated video silhouettes in real time"
     width="480">
</a>

### Live Interactive Demo

[cosmiciron.github.io/layoutmaster](https://cosmiciron.github.io/layoutmaster/)

## The Hero's Secret Origin

I hear you thinking — how is this possible? 

*Is this even legal?*

Two words: *game engines*.

For decades, while layout technology stayed pretty much stale, game engine technology
advanced enormously. Layoutmaster comes from that lineage. It is —

*The world's first layout engine with game engine DNA.*

That — is where the insane speed comes from.

Put simply, the master does not see text as sequential streams of characters or layout 
as a pile of complex conditionals. It sees actors, collisions, terrain, constraints, 
viewports, and deterministic updates.

Under its tiny browser API is a deterministic 2D spatial simulation engine for layout —
content enters a "world", collides with constraints, flows through regions, avoids terrain,
splits across viewports, and settles into exact coordinates.

That is where the master gets its superpowers.

## The Four Mantras

`form()`, `fit()`, `flow()`, and `pour()`

These are the four mantras (APIs if you like, but the master prefers mantras) of the
Layoutmaster. Do not be deceived by their overwhelming simplicity. These four verbs can
solve a world of complex layout challenges and unlock possibilities you could only dream of
before - precisely none of which browsers could do without rebuilding DOMs.

```js
import {
  form,
  fit,
  flow,
  pour,
  exclusion
} from "@layoutmaster/layoutmaster";
```

I know, you count five. We will get to that later. Just trust the master.

### `form` - given space, how does this lay out, and how tall does it get?

The most fundamental question in layout. You have content and a width. You want
to know what happens. `form()` gives you the pieces and the height.

```js
const result = form("Layout is data.", {
  width: 320,
  fontFamily: "Georgia, serif",
  fontSize: 18,
  lineHeight: 1.4,
  direction: "auto",
  lang: "en"
});

console.log(result.height);
console.log(result.pieces);
```

### `fit` - given bounded space, what fits, and what remains?

Boxes have lids. `fit()` is for when overflow matters: what consumed the space,
what could not, and what needs to go somewhere else.

```js
const result = fit(longText, {
  width: 360,
  height: 240
});

console.log(result.content.consumed.text);
console.log(result.content.remaining.text);
```

### `flow` - given content that overflows, where does it continue?

Magazines and newspapers have known for centuries that content does not always
fit in one box. `flow()` carries text through multiple regions and tells you
exactly what landed where. Perfect for multi-column layouts, split panels, 
magazine spreads.

```js
const result = flow(longText, [
  { width: 260, height: 320 },
  { width: 260, height: 320 }
]);

console.log(result.placements.map((p) => p.pieces));
```

### `pour` - given a shape instead of a rectangle, fill it.

Not every layout surface is a box. `pour()` fills text like water inside ANY 
shape - circles, polygons, image silhouettes, arbitrary geometry. 

```js
const shape = exclusion.circle({ x: 40, y: 40, radius: 140 });
const result = pour(longText, shape, {
  width: 360,
  height: 360,
  fontSize: 16
});

console.log(result.pieces);
```

## Be Water, My Friend

Here is that "fifth" element.

Remember, *the highest virtue is like water*. Text in Layoutmaster is like water. 
It fills, it bends, it flows, and it navigates around any obstacle you place in 
its path. Those obstacles are called exclusions - and they are one of the master's 
finest tricks.

Exclusions are reusable spatial geometry. Build them from primitives or sample
them directly from image and video alpha channels. Pass them as obstacles to
`form()` and `fit()`, or flip them inside out and use them as containers for
`pour()`. They are serializable and replayable - compile the geometry once, use
it everywhere, store it as JSON, replay it without the original source.

```js
exclusion.circle({ x, y, radius, gap });
exclusion.rect({ x, y, width, height, gap });
exclusion.ellipse({ x, y, width, height, gap });
exclusion.polygon({ x, y, points, gap });
exclusion.assembly({ x, y, parts, gap });
exclusion.fromAlphaChannel(alpha, width, height, options);
exclusion.fromJSON(savedData, options);
```

Assemblies are crude composed fields: circles, rectangles, ellipses, polygons,
and line/capsule helpers merged into one obstacle. That makes them a good fit
for stick figures, mascots, diagrams, dragons, and other programmable shapes
where speed matters more than perfect contours.

The dancing text demo builds exclusion assemblies from video frames and animates 
them through `form()` with smooth framerate. The text renegotiates its path on 
every frame around the actual shape of the figure in motion.

No CSS tricks. No pre-authored columns. Uses 1% of your CPU. No browser screaming 
at you in distress.

## Performance

Browser layout is actually very fast. Those who claim their stuff is 600 times faster 
are lying, big time.

But Layoutmaster is just *as fast*, creating usual layouts just as beautifully and quickly 
as the browser would, so you can use it as a replacement for browser DOM-based layout on 
regular stuff without guilt. 

And mind you, the browser's layout engine is written in C++ with direct access to font 
machinery and rendering internals. So the mere fact that the master hangs with it nicely 
tells you it is punching above its weight.

But *David would not have become a legend* if all he had done was throw one rock.

### The Resize Test

This test is not about a benchmark table. It is about what happens when the layout has to 
keep changing while the user is changing the available space. So I recorded it.

> **Watch the resize stress test:**
>
> <a href="https://youtu.be/qy0HDfbuthw">
>   <img src="https://i.ytimg.com/vi/qy0HDfbuthw/hqdefault.jpg"
>     alt="Layoutmaster versus DOM masonry resize stress test" width="480">
> </a>

The test is a masonry wall made from the same book content. Each chapter becomes a live card.

Layoutmaster uses `fit()` to solve the text pieces, packs the cards,
and paints the returned geometry. The browser version uses ordinary DOM/CSS flow.

As shown in the video, Layoutmaster keeps recomputing the whole wall in roughly the same 
bounded range - around 400ms for the 300+ card case - and snaps into the new geometry as the
window changes. 

Resize it slowly, resize it quickly, resize it violently: the solve remains explicit. Given 
a width, the engine returns a wall.

The browser version does it in 4,000ms, which isn't so bad. Then it falls apart when you grab 
its window and resize. The layout goes into a frenzy and cannot settle until some 20+ seconds 
later. Try harder, it can take even minutes to recover.

That's the whole point — when layout becomes highly dynamic and intense, it can overwhelm the
browser. That's why you should leave the job to the specialist — 

Let Layoutmaster handle the layout for the browser, and let the browser handle everything else.

## Footprint

At this point you probably picture the master as a burly man smoking a cigar and holding a 
Gatling gun torn from a tank. 

Nope. 

The package packs to about 243 kB on npm - about 206 KiB gzip at runtime, the embedded
engine included. 

**No other dependencies.**

So like the master (the other one) says: 

*Smaller in number are we, but larger in mind*.

## Install

```bash
npm install @layoutmaster/layoutmaster
```

*Layoutmaster is specifically built for the browser so it requires the Canvas
API to be available. If you need non-browser solutions, head over to the sibling
project [VMPrint](https://github.com/cosmiciron/vmprint).*

## Repo Map

- [src](https://github.com/cosmiciron/layoutmaster/tree/main/src): the public package surface
- [engine](https://github.com/cosmiciron/layoutmaster/tree/main/engine): the embedded engine copy built locally
- [demos](https://github.com/cosmiciron/layoutmaster/tree/main/demos): browser demos and showcases
- [demos/helpers](https://github.com/cosmiciron/layoutmaster/tree/main/demos/helpers): copyable helper source used by demos
- [documents](https://github.com/cosmiciron/layoutmaster/tree/main/documents): API, rendering, helper, and product notes
- [CONTRIBUTING.md](https://github.com/cosmiciron/layoutmaster/blob/main/CONTRIBUTING.md): local setup and project boundaries

Useful reading:

- [API reference](https://github.com/cosmiciron/layoutmaster/blob/main/documents/API-REFERENCE.md)
- [Structured content](https://github.com/cosmiciron/layoutmaster/blob/main/documents/STRUCTURED-CONTENT.md)
- [Painting pieces](https://github.com/cosmiciron/layoutmaster/blob/main/documents/PAINTING-PIECES.md)
- [Piece contract](https://github.com/cosmiciron/layoutmaster/blob/main/documents/PIECE-CONTRACT.md)
- [Helpers](https://github.com/cosmiciron/layoutmaster/blob/main/documents/HELPERS.md)

## Run The Demos

```bash
npm run serve
```

The server starts at `http://127.0.0.1:4173/`. Open
`http://127.0.0.1:4173/demos/` for the demo index.

The public demo site runs the published npm package through an ESM CDN, so it
matches what package consumers actually install.

To make demos use your local workspace source instead of the published package,
append `?local` to any demo URL.

Examples:

- `http://127.0.0.1:4173/demos/form.html?local`
- `http://127.0.0.1:4173/demos/pour-image.html?local`

Without `?local`, demos import `@layoutmaster/layoutmaster` from the CDN.

Current demos:

- `form`: width-bounded fragments and returned pieces
- `fit`: bounded layout with consumed and remaining content
- `flow`: continuation through multiple targets
- `bidi`: native browser BIDI rendering beside Layoutmaster's solved pieces
- `browser-fonts`: browser font-scope probe with DOM text beside Layoutmaster pieces using the same CSS stack and native fallback
- `pour`: text contained inside a primitive shape
- `pour-image`: text contained inside image-derived alpha geometry
- `pieces`: minimal piece and baseline inspection
- `exclusion`: live primitive exclusion fields
- `exclusion-assembly`: animated primitive assembly rig with hideable visual layer
- `exclusion-image`: image alpha as wrap geometry
- `masonry-book`: chapter cards packed from Layoutmaster `fit()` pieces
- `dancing-text`: animated exclusion fields from video frames

The demos use browser import maps, so serve them from the repo root. Opening
the files directly from disk won't work well.

## Helpers

The master keeps its package small. Browser image sampling, video frame
extraction, and HTML piece painting live as source files under
[demos/helpers](https://github.com/cosmiciron/layoutmaster/tree/main/demos/helpers).
They are official examples, not package exports.

Copy them when they help. Change them when your app needs something different.
The deal is simple: helpers may prepare explicit inputs or paint returned
results. They do not get to make up layout geometry. That is the master's job.

## The One Rule

Every layout decision belongs to the engine.

- engine owns layout
- wrapper owns normalization and result projection
- helpers own adapter glue
- demos own inspection and presentation
- applications own rendering

If browser code starts inventing line breaks, baselines, page geometry, or
continuation behavior, it has wandered into engine territory. Gently escort it
back.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertPerformanceShape,
  loadRegressionFixtures,
  readSnapshot,
  runFixture,
  writeSnapshot
} from "./harness/layoutmaster-harness.mjs";

const updateSnapshots =
  process.argv.includes("--update-regression-snapshots")
  || process.env.LAYOUTMASTER_UPDATE_REGRESSION_SNAPSHOTS === "1";

const fixtures = loadRegressionFixtures();
const layoutmasterModule = await import(pathToFileURL(path.join(process.cwd(), "src", "index.js")).href);
const projectionModule = await import(pathToFileURL(path.join(process.cwd(), "src", "internal", "engine-result-projection.js")).href);
const browserRuntimeModule = await import(pathToFileURL(path.join(process.cwd(), "src", "browser-runtime.js")).href);
const {
  form,
  fit,
  flow,
  pour,
  exclusion,
  debugBuildHiddenDocument
} = layoutmasterModule;
const {
  extractRegionResults
} = projectionModule;
const {
  createBrowserTextDelegate,
  getBrowserFallbackFontEntries
} = browserRuntimeModule;

test("layoutmaster regression fixtures remain stable", async (t) => {
  for (const fixture of fixtures) {
    await t.test(fixture.name, () => {
      const { actual, performance } = runFixture(fixture);
      assertPerformanceShape(performance, fixture.name);

      if (updateSnapshots || !fs.existsSync(fixture.snapshotPath)) {
        writeSnapshot(fixture.snapshotPath, actual);
      }

      const expected = readSnapshot(fixture.snapshotPath);
      assert.deepStrictEqual(actual, expected);
    });
  }
});

test("layoutmaster accepts exclusion descriptors across form, fit, and flow targets", () => {
  const circle = exclusion.circle({ radius: 24 });
  const rect = exclusion.rect({ x: 16, y: 8, width: 28, height: 18 });
  const ellipse = exclusion.ellipse({ x: 44, y: 10, width: 40, height: 24 });
  const polygon = exclusion.polygon({
    x: 18,
    y: 12,
    points: [[0, 0], [34, 0], [42, 18], [12, 36], [0, 20]]
  });
  assert.deepEqual(
    Object.keys(rect).sort(),
    ["input", "kind"]
  );
  assert.equal(rect.kind, "rect");
  assert.ok(Object.isFrozen(rect));
  assert.ok(Object.isFrozen(rect.input));

  const formResult = form("Hello world", {
    width: 180,
    exclusions: [circle, rect, ellipse, polygon]
  });
  assert.ok(Array.isArray(formResult.pieces));

  const fitResult = fit("Hello world", {
    width: 180,
    height: 60,
    exclusions: [rect]
  });
  assert.equal(typeof fitResult.content.complete, "boolean");
  assert.equal(typeof fitResult.content.consumed.text, "string");
  assert.equal(typeof fitResult.content.remaining.text, "string");
  assert.equal(typeof fitResult.content.consumed.length, "number");

  const flowResult = flow("Hello world", [
    { width: 180, height: 60, exclusions: [rect] },
    { width: 180, height: 60, exclusions: [circle, rect, ellipse, polygon] }
  ]);
  assert.ok(Array.isArray(flowResult.placements));
  assert.equal(typeof flowResult.content.consumed.text, "string");
  assert.equal(typeof flowResult.placements[0].content.consumed.text, "string");
});

test("layoutmaster flow uses variable target pages as one continuous document", () => {
  const text = [
    "A narrow opening frame starts the story with English and numbers 12345.",
    "第二个区域更宽，可以容纳更多连续文本和标点。",
    "日本語と 한국어 fragments continue without resetting the story.",
    "Arabic مثال قصير should keep flowing into the later region.",
    "The final paragraph keeps enough words available for the last target."
  ].join(" ");
  const result = flow(text.repeat(3), [
    { width: 135, height: 52, fontSize: 12, lineHeight: 1.25 },
    { width: 245, height: 94, fontSize: 12, lineHeight: 1.25 },
    { width: 170, height: 72, fontSize: 12, lineHeight: 1.25 }
  ]);

  assert.equal(result.placements.length, 3);
  assert.ok(result.placements.every((placement) => placement.pieces.length > 0));
  assert.ok(result.placements[1].content.consumed.length > result.placements[0].content.consumed.length);
  assert.equal(
    result.content.consumed.text,
    result.placements.map((placement) => placement.content.consumed.text).join("")
  );
  assert.equal(
    result.placements[1].content.sourceLength,
    result.placements[1].content.consumed.length + result.placements[1].content.remaining.length
  );
  for (const placement of result.placements) {
    const target = [
      { width: 135, height: 52 },
      { width: 245, height: 94 },
      { width: 170, height: 72 }
    ][placement.index];
    const maxRight = Math.max(0, ...placement.pieces.map((piece) => Number(piece.x || 0) + Number(piece.width || 0)));
    assert.ok(maxRight <= target.width + 0.5, `expected placement ${placement.index} to reflow within its target width`);
  }
});

test("layoutmaster keeps mixed Arabic bidi pieces inside the solved width", () => {
  const fixture = fixtures.find((item) => item.name === "06-form-bidi-arabic-mixed.json");
  assert.ok(fixture, "expected bidi Arabic regression fixture to be present");

  const { actual } = runFixture(fixture);
  const targetWidth = Number(fixture.payload.options.width);
  const directions = new Set(actual.pieces.map((piece) => piece.direction));

  assert.ok(directions.has("rtl"), "expected RTL Arabic pieces");
  assert.ok(directions.has("ltr"), "expected LTR English and numeric islands");

  for (const piece of actual.pieces) {
    assert.ok(piece.x >= -0.001, `expected "${piece.text}" to stay inside the left edge`);
    assert.ok(
      piece.x + piece.width <= targetWidth + 0.5,
      `expected "${piece.text}" to stay inside the right edge`
    );
  }

  for (const text of ["VMPrint", "0.1.0", "PDF", "100", "123,456"]) {
    const piece = actual.pieces.find((item) => item.text === text);
    assert.ok(piece, `expected "${text}" to remain a distinct bidi island`);
    assert.equal(piece.direction, "ltr", `expected "${text}" to keep LTR direction`);
  }

  const percentPieces = form(
    "تتطلب نسبة 100% من المشاريع دقة في الأرقام",
    {
      width: targetWidth,
      fontSize: 20,
      lineHeight: 1.45,
      direction: "rtl",
      lang: "ar"
    }
  ).pieces;
  const percentNumber = percentPieces.find((piece) => piece.text === "100");
  const percentMark = percentPieces.find((piece) => piece.text === "%");
  assert.ok(percentNumber, "expected percent number to become a numeric atom");
  assert.ok(percentMark, "expected percent mark to become its own punctuation atom");
  assert.equal(percentNumber.direction, "ltr");
  assert.equal(percentNumber.lineDirection, "rtl");
  assert.equal(percentMark.lineDirection, "rtl");
  assert.ok(
    percentMark.x < percentNumber.x,
    "expected percent mark to occupy the visual-leading side of an RTL line"
  );

  const arabicPrefixWithPercent = form(
    "تظهر الكلمات PDF وCanvas و100% داخل الجملة العربية.",
    {
      width: targetWidth,
      fontFamily: "Arial, 'Noto Naskh Arabic', 'Noto Sans Arabic', sans-serif",
      fontSize: 22,
      lineHeight: 1.45,
      direction: "rtl",
      lang: "ar"
    }
  );
  assert.ok(
    !arabicPrefixWithPercent.pieces.some((piece) => piece.text === "و100%"),
    "expected Arabic conjunction not to swallow a numeric island"
  );
  const arabicPrefix = arabicPrefixWithPercent.pieces.find((piece) => piece.text === "و");
  const numericIsland = arabicPrefixWithPercent.pieces.find((piece) => piece.text === "100");
  const percentAtom = arabicPrefixWithPercent.pieces.find((piece) => piece.text === "%");
  assert.ok(arabicPrefix, "expected Arabic conjunction to be exposed as its own piece");
  assert.ok(numericIsland, "expected percent number to be exposed as its own piece");
  assert.ok(percentAtom, "expected percent mark to be exposed as its own piece");
  assert.equal(arabicPrefix.direction, "rtl");
  assert.equal(numericIsland.direction, "ltr");
  assert.equal(numericIsland.lineDirection, "rtl");
  assert.equal(percentAtom.lineDirection, "rtl");

  for (const direction of ["rtl", "ltr"]) {
    const parenResult = form(
      'هل تبقى علامات الترقيم مثل (123,456) و"VMPrint" في موضع منطقي؟',
      {
        width: targetWidth,
        fontFamily: "Arial, 'Noto Naskh Arabic', 'Noto Sans Arabic', sans-serif",
        fontSize: 20,
        lineHeight: 1.45,
        direction,
        lang: "ar"
      }
    );
    const parenOpen = parenResult.pieces.find((piece) => String(piece.text || "").includes("("));
    const parenNumber = parenResult.pieces.find((piece) => piece.text === "123,456");
    const parenClose = parenResult.pieces.find((piece) => String(piece.text || "").includes(")"));
    assert.ok(parenOpen, `expected opening parenthesis to render in ${direction.toUpperCase()} mode`);
    assert.ok(parenNumber, `expected parenthesized number to render in ${direction.toUpperCase()} mode`);
    assert.ok(parenClose, `expected closing parenthesis to render in ${direction.toUpperCase()} mode`);
    assert.equal(parenNumber.direction, "ltr");
    assert.ok(
      parenOpen.x < parenNumber.x,
      `expected opening parenthesis to occupy the visual-leading side in ${direction.toUpperCase()} mode`
    );
    assert.ok(
      parenClose.x > parenNumber.x,
      `expected closing parenthesis to occupy the visual-trailing side in ${direction.toUpperCase()} mode`
    );
  }

  const ltrBase = form(
    "The word للنشر means 'for publishing' and مرحبا means 'welcome' in Arabic.",
    {
      width: targetWidth,
      fontSize: 20,
      lineHeight: 1.45,
      direction: "ltr",
      lang: "en"
    }
  );
  const ltrPieces = ltrBase.pieces;
  const firstEnglishPiece = ltrPieces.find((piece) => String(piece.text || "").startsWith("The word "));
  const arabicPiece = ltrPieces.find((piece) => String(piece.text || "").includes("للنشر"));
  assert.ok(firstEnglishPiece, "expected LTR base text to begin with English");
  assert.ok(arabicPiece, "expected Arabic word to stay present inside LTR base text");
  assert.ok(
    firstEnglishPiece.x <= 0.5,
    "expected opening English run to stay anchored at the left edge in LTR base text"
  );
});

test("layoutmaster browser font mode preserves author CSS stacks for multilingual fallback", () => {
  const fontFamily = '"Inter", system-ui, sans-serif';
  const result = form(JSON.stringify({
    elements: [{
      type: "p",
      children: [{
        type: "span",
        content: "Latin العربية 中文 日本語 emoji 😀",
        properties: {
          style: {
            fontFamily,
            fontSize: 18
          }
        }
      }]
    }]
  }), {
    width: 260,
    fontFamily: "Times New Roman, Times, serif",
    fontSize: 18,
    lineHeight: 1.3
  });

  assert.ok(result.pieces.length > 0, "expected multilingual pieces");
  assert.ok(
    result.pieces.length >= 5,
    "expected browser mode to preserve mixed-script piece boundaries"
  );
  assert.ok(
    result.pieces.every((piece) => piece.fontFamily === fontFamily),
    "expected browser mode to preserve the author CSS font stack instead of injecting fallback families"
  );

  const bidiBoundary = form("Latin text, العربية الفصحى, עברית קצרה, 中文排版", {
    width: 566,
    fontFamily,
    fontSize: 26,
    lineHeight: 2
  });
  assert.ok(
    !bidiBoundary.pieces.some((piece) => String(piece.text || "").includes("קצרה,")),
    "expected trailing comma after Hebrew to stay out of the RTL word piece"
  );
  const cjkIndex = bidiBoundary.pieces.findIndex((piece) => piece.text === "中");
  assert.ok(cjkIndex > 0, "expected CJK run to stay visible after mixed RTL text");
  assert.equal(
    bidiBoundary.pieces[cjkIndex - 1]?.text,
    ", ",
    "expected separator comma to remain visible before the CJK run"
  );

  const punctuationStress = "Bidi punctuation: العربية الفصحى, עברית קצרה, numbers (123,456), percent 100%, quote \"VMPrint\", then English again.";
  for (const width of [260, 360, 460]) {
    const stressPieces = form(punctuationStress, {
      width,
      fontFamily: '"Inter", system-ui, "Noto Sans Arabic", "Noto Sans Hebrew", sans-serif',
      fontSize: 24,
      lineHeight: 1.5
    }).pieces;

    assert.ok(
      stressPieces.some((piece) => String(piece.text || "").startsWith("100%")),
      `expected percent sign to stay attached to 100 at width ${width}`
    );
    assert.ok(
      !stressPieces.some((piece, index) => (
        String(piece.text || "").endsWith("100")
        && String(stressPieces[index + 1]?.text || "").startsWith("%")
      )),
      `expected no line break between 100 and % at width ${width}`
    );
    assert.ok(
      stressPieces.some((piece) => String(piece.text || "").startsWith('"VMPrint')),
      `expected opening quote to stay attached to VMPrint at width ${width}`
    );
    assert.ok(
      !stressPieces.some((piece) => String(piece.text || "") === '"'),
      `expected opening quote not to dangle as its own piece at width ${width}`
    );
  }
});

test("layoutmaster projects base font family onto plain API pieces", () => {
  const fontFamily = "Georgia, serif";
  const result = form("Changing demo fonts should change the painted pieces.", {
    width: 420,
    fontFamily,
    fontSize: 18,
    lineHeight: 1.35
  });

  assert.ok(result.pieces.length > 0, "expected form to return pieces");
  assert.ok(
    result.pieces.every((piece) => piece.fontFamily === fontFamily),
    "expected plain text pieces to carry the requested base font family"
  );
});

test("layoutmaster browser runtime prewarms mapped fallback fonts without enabling fallback injection", () => {
  const textDelegate = createBrowserTextDelegate();
  const fallbackFonts = getBrowserFallbackFontEntries();
  const fallbackNames = fallbackFonts.map((font) => font.name);

  assert.ok(fallbackNames.some((name) => name.startsWith("Noto Sans SC ")), "expected CJK browser fallback preload");
  assert.ok(fallbackNames.some((name) => name.startsWith("Noto Sans Arabic ")), "expected Arabic browser fallback preload");
  assert.equal(textDelegate.getFallbackFamilies().length, 0, "expected browser mode to avoid fallback-family injection");
  assert.equal(textDelegate.getEnabledFallbackFonts().length, 0, "expected fallback prewarming to stay separate from enabled fallbacks");
});

test("layoutmaster lowers direction and lang options into the engine document", () => {
  const hidden = debugBuildHiddenDocument("English مرحبا", {
    width: 220,
    fontSize: 20,
    lineHeight: 1.45,
    direction: "rtl",
    lang: "ar"
  }, "form");
  assert.equal(hidden.layout.direction, "rtl");
  assert.equal(hidden.layout.lang, "ar");

  const result = form("English مرحبا", {
    width: 220,
    fontSize: 20,
    lineHeight: 1.45,
    direction: "rtl",
    lang: "ar"
  });
  assert.ok(result.lines.length > 0, "expected at least one solved line");
  assert.equal(result.lines[0].direction, "rtl");
  assert.ok(
    result.pieces.some((piece) => piece.lineDirection === "rtl"),
    "expected pieces to carry the lowered RTL line context"
  );
});

test("layoutmaster projects pieces with the engine line-height policy", () => {
  const fontSize = 25;
  const lineHeight = 1.45;
  const lineHeightPx = fontSize * lineHeight;
  const textSegment = (text, sourceStart, width) => ({
    text,
    width,
    sourceStart,
    sourceEnd: sourceStart + text.length,
    ascent: 835,
    descent: 165
  });
  const blankSegment = () => ({
    text: "",
    width: 0,
    ascent: 920,
    descent: 220
  });
  const [region] = extractRegionResults([{
    index: 0,
    width: 560,
    height: 400,
    boxes: [{
      x: 0,
      y: 0,
      w: 560,
      h: 300,
      style: { fontSize, lineHeight },
      meta: { sourceId: "author:blank-line-policy", engineKey: "ek:blank-line-policy" },
      lines: [
        [textSegment("This source is still owned by the host.", 0, 410)],
        [blankSegment()],
        [textSegment("Every inserted character rebuilds the hologram.", 41, 526)],
        [blankSegment()],
        [blankSegment()],
        [textSegment("The caret returns by source offset, not DOM ", 91, 490)],
        [textSegment("selection.", 135, 104)]
      ]
    }]
  }], [], null, {
    layout: {
      fontSize,
      lineHeight,
      lineHeightMode: "css",
      lineHeightAdjustment: 0
    }
  });

  assert.deepEqual(
    region.pieces.map((piece) => Number(piece.y.toFixed(3))),
    [0, 2, 5, 6].map((lineIndex) => Number((lineIndex * lineHeightPx).toFixed(3)))
  );
  assert.deepEqual(
    region.pieces.map((piece) => Number(piece.height.toFixed(3))),
    new Array(4).fill(Number(lineHeightPx.toFixed(3)))
  );
});

test("layoutmaster exclusions alter the returned wrap plan", () => {
  const content = "The quick brown fox jumps over the lazy dog. ".repeat(18);
  const base = form(content, { width: 220 });
  const wrapped = form(content, {
    width: 220,
    exclusions: [
      exclusion.circle({ x: 52, y: 20, radius: 32 })
    ]
  });

  assert.ok(base.pieces.length > 0);
  assert.ok(wrapped.pieces.length > 0);
  assert.notDeepStrictEqual(
    wrapped.pieces.slice(0, 12),
    base.pieces.slice(0, 12),
    "expected early returned pieces to shift once a circle exclusion is present"
  );
  assert.ok(
    wrapped.height >= base.height,
    "expected an exclusion-wrapped form to preserve or increase occupied height"
  );
});

test("layoutmaster exclusions preserve sibling paragraph text order", () => {
  const content = [
    "First paragraph should stay first when a world-plain exclusion wrapper is present.",
    "Second paragraph should stay second while it wraps around the live field."
  ].join("\n\n");
  const wrapped = form(content, {
    width: 320,
    exclusions: [
      exclusion.circle({ x: 70, y: 56, radius: 38 })
    ]
  });
  const rendered = wrapped.pieces.map((piece) => String(piece.text || "")).join(" ").replace(/\s+/g, " ");

  assert.ok(
    rendered.indexOf("First paragraph") >= 0,
    "expected first paragraph text to be present"
  );
  assert.ok(
    rendered.indexOf("Second paragraph") > rendered.indexOf("First paragraph"),
    "expected duplicate interaction target ids not to reorder sibling paragraph text"
  );
});

test("layoutmaster ellipse exclusions alter the returned wrap plan", () => {
  const content = "Pack my box with five dozen liquor jugs. ".repeat(18);
  const base = form(content, { width: 240 });
  const wrapped = form(content, {
    width: 240,
    exclusions: [
      exclusion.ellipse({ x: 48, y: 18, width: 96, height: 54 })
    ]
  });

  assert.ok(base.pieces.length > 0);
  assert.ok(wrapped.pieces.length > 0);
  assert.notDeepStrictEqual(
    wrapped.pieces.slice(0, 12),
    base.pieces.slice(0, 12),
    "expected early returned pieces to shift once an ellipse exclusion is present"
  );
});

test("layoutmaster polygon exclusions alter the returned wrap plan", () => {
  const content = "Sphinx of black quartz, judge my vow. ".repeat(20);
  const base = form(content, { width: 250 });
  const wrapped = form(content, {
    width: 250,
    exclusions: [
      exclusion.polygon({
        x: 56,
        y: 16,
        points: [
          [24, 0],
          [88, 6],
          [110, 44],
          [76, 78],
          [18, 72],
          [0, 34]
        ]
      })
    ]
  });

  assert.ok(base.pieces.length > 0);
  assert.ok(wrapped.pieces.length > 0);
  assert.notDeepStrictEqual(
    wrapped.pieces.slice(0, 12),
    base.pieces.slice(0, 12),
    "expected early returned pieces to shift once a polygon exclusion is present"
  );
});

test("layoutmaster pour uses the engine-backed containment path", () => {
  const content = "Pack my box with five dozen liquor jugs. ".repeat(24);
  const shape = exclusion.ellipse({ x: 24, y: 18, width: 180, height: 160, gap: 4 });
  const result = pour(content, shape, {
    fontSize: 14,
    lineHeight: 1.4,
    hyphenation: "auto"
  });

  assert.ok(Array.isArray(result.pieces));
  assert.ok(result.pieces.length > 0, "expected pour() to return engine-laid pieces");
  assert.equal(typeof result.content.complete, "boolean");
  assert.equal(typeof result.content.consumed.text, "string");
  assert.equal(typeof result.content.remaining.text, "string");
  assert.ok(
    Number(result.performance.layoutMs) > 0,
    "expected pour() to report native engine layout time"
  );
  assert.ok(
    Number(result.performance.wrapStreamMs) > 0,
    "expected pour() to expose engine wrap profiling instead of zeroed fallback metrics"
  );
});

test("layoutmaster pour does not fill transparent bottom padding in alpha assemblies", () => {
  const width = 300;
  const height = 260;
  const alphaBottom = 218;
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < alphaBottom; y++) {
    const halfWidth = Math.floor((y / alphaBottom) * 140);
    const centerX = Math.floor(width / 2);
    for (let x = centerX - halfWidth; x <= centerX + halfWidth; x++) {
      if (x >= 0 && x < width) {
        alpha[y * width + x] = 255;
      }
    }
  }

  const shape = exclusion.fromAlphaChannel(alpha, width, height, {
    bandHeight: 1,
    tiers: 1,
    gap: 0
  });
  const result = pour(
    "The rain in Seattle did not just wash the streets; it slicked the neon signs of the 24-hour convenience stores into blurry, chromatic streaks. ".repeat(8),
    shape,
    {
      fontFamily: "Times New Roman",
      fontSize: 18,
      lineHeight: 1.42
    }
  );
  const maxPieceBottom = Math.max(...result.pieces.map((piece) => piece.y + piece.height));

  assert.ok(result.pieces.length > 0, "expected alpha assembly to produce visible pieces");
  assert.ok(
    maxPieceBottom <= alphaBottom + 0.1,
    `expected pieces to stop inside alpha silhouette, got bottom ${maxPieceBottom}`
  );
});

test("layoutmaster pour stops grapheme fallback before alpha assembly bottom", () => {
  const width = 72;
  const height = 190;
  const alphaBottom = 138;
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < alphaBottom; y++) {
    for (let x = 24; x < 48; x++) {
      alpha[y * width + x] = 255;
    }
  }

  const shape = exclusion.fromAlphaChannel(alpha, width, height, {
    bandHeight: 1,
    tiers: 1,
    gap: 0
  });
  const result = pour(
    "Supercalifragilisticexpialidocious".repeat(6),
    shape,
    {
      fontFamily: "Times New Roman",
      fontSize: 18,
      lineHeight: 1.42
    }
  );
  const maxPieceBottom = Math.max(...result.pieces.map((piece) => piece.y + piece.height));

  assert.ok(result.pieces.length > 0, "expected narrow alpha column to produce visible pieces");
  assert.ok(
    maxPieceBottom <= alphaBottom + 0.1,
    `expected grapheme fallback to stop inside alpha silhouette, got bottom ${maxPieceBottom}`
  );
  assert.ok(
    result.content.remaining.length > 0,
    "expected overflowing graphemes to remain in the content report instead of rendering below the container"
  );
});

test("layoutmaster builds authored primitive exclusion assemblies", () => {
  const shape = exclusion.assembly({
    x: 76,
    y: 36,
    gap: 2,
    parts: [
      { kind: "circle", x: 0, y: 42, radius: 28 },
      { kind: "rect", x: 38, y: 50, width: 88, height: 30 },
      { kind: "circle", x: 102, y: 18, width: 72, height: 72 },
      { kind: "polygon", points: [[152, 50], [206, 26], [198, 86]] },
      { kind: "capsule", x: 88, y: 96, length: 74, angle: 28, thickness: 10 }
    ]
  });
  const saved = shape.toJSON();
  const result = form(
    "Authored primitive assemblies let one logical obstacle publish several crude lobes. ".repeat(8),
    {
      width: 360,
      fontFamily: "Times New Roman",
      fontSize: 18,
      lineHeight: 1.35,
      exclusions: [shape]
    }
  );

  assert.equal(shape.kind, "assembly");
  assert.equal(shape.parts.count, 5);
  assert.equal(saved.members.length, 5);
  assert.equal(saved.members[0].shape, "circle");
  assert.equal(saved.members[4].shape, "polygon");
  assert.match(saved.members[4].path, /^M/);
  assert.ok(shape.width >= 206, "expected assembly width to be inferred from primitive bounds");
  assert.ok(shape.height >= 98, "expected assembly height to be inferred from primitive bounds");
  assert.ok(result.pieces.length > 0, "expected authored assembly to participate in form layout");
});

test("layoutmaster pour keeps returned circle pieces inside the primitive", () => {
  const radius = 210;
  const text = "Pour flips the polarity. Instead of routing around a spatial field, text occupies the inside of the shape itself. That makes primitive geometry usable as a direct editorial container instead of just an obstacle.";
  const result = pour(
    text,
    exclusion.circle({ radius }),
    {
      fontFamily: "Times New Roman",
      fontSize: 33,
      lineHeight: 1.4,
      hyphenation: "off"
    }
  );
  const center = radius;
  const tolerance = 0.1;
  const leakedPieces = result.pieces.filter((piece) => {
    const corners = [
      [piece.x, piece.y],
      [piece.x + piece.width, piece.y],
      [piece.x, piece.y + piece.height],
      [piece.x + piece.width, piece.y + piece.height]
    ];
    return corners.some(([x, y]) => Math.hypot(x - center, y - center) > radius + tolerance);
  });

  assert.ok(result.pieces.length > 0, "expected circle pour to produce visible pieces");
  assert.ok(result.content.remaining.length > 0, "expected circle pour to leave overflow outside the primitive");
  assert.deepEqual(
    leakedPieces.map((piece) => piece.text),
    [],
    `expected returned pieces to stay inside the circle, got leaks for ${leakedPieces.map((piece) => JSON.stringify(piece.text)).join(", ")}`
  );
});

test("layoutmaster pour rejects sub-typographic alpha tendrils", () => {
  const width = 220;
  const height = 160;
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < 130; y++) {
    for (let x = 20; x < 28; x++) {
      alpha[y * width + x] = 255;
    }
    for (let x = 82; x < 182; x++) {
      alpha[y * width + x] = 255;
    }
  }

  const shape = exclusion.fromAlphaChannel(alpha, width, height, {
    bandHeight: 1,
    tiers: 1,
    gap: 0
  });
  const result = pour(
    "The rain in Seattle did not just wash the streets; it slicked the neon signs into blurry chromatic streaks. ".repeat(6),
    shape,
    {
      fontFamily: "Times New Roman",
      fontSize: 18,
      lineHeight: 1.42
    }
  );
  const leakedTendrilPieces = result.pieces.filter((piece) => piece.x < 50);

  assert.ok(result.pieces.length > 0, "expected broad alpha region to produce visible pieces");
  assert.equal(
    leakedTendrilPieces.length,
    0,
    `expected pour() to skip narrow alpha tendril lanes, got ${leakedTendrilPieces.length}`
  );
});

test("layoutmaster core rejects HTML format input", () => {
  assert.throws(
    () => form("<p>HTML is now a helper adapter input.</p>", { width: 180, format: "html" }),
    /Unsupported format "html"/
  );
});

test("layoutmaster core accepts only string content", () => {
  const elements = [{ type: "p", content: "Object input is no longer public API." }];
  assert.throws(
    () => form(elements, { width: 180 }),
    /content must be a string/
  );
  assert.throws(
    () => form({ elements }, { width: 180 }),
    /content must be a string/
  );
  assert.throws(
    () => form(JSON.stringify({ elements }), { width: 180, format: "ast" }),
    /Unsupported format "ast"/
  );
});

test("layoutmaster APIs accept structured text JSON strings", () => {
  const elements = [
    {
      type: "h1",
      content: "Structured Content Fragment",
      properties: {
        sourceId: "ast-title"
      }
    },
    {
      type: "p",
      content: "",
      properties: {
        sourceId: "ast-body",
        _sectionRole: "body-copy",
        style: {
          fontSize: 18,
          lineHeight: 1.35
        }
      },
      children: [
        { type: "text", content: "Alpha " },
        {
          type: "text",
          content: "bold",
          properties: {
            _tokenKind: "emphasis",
            style: {
              fontWeight: "700",
              letterSpacing: 1.5
            }
          }
        },
        { type: "text", content: " omega. ".repeat(8) }
      ]
    }
  ];

  const content = JSON.stringify({ elements });
  const hidden = debugBuildHiddenDocument(content, { width: 180 }, "form");
  assert.equal(hidden.layout?.emitInteractionMap, undefined);
  assert.equal(hidden.elements?.[0]?.type, "h1");
  assert.equal(hidden.elements?.[1]?.children?.[1]?.content, "bold");
  assert.equal(hidden.elements?.[1]?.children?.[1]?.properties?.style?.letterSpacing, 1.5);

  const solved = form(content, { width: 180 });
  assert.ok(solved.pieces.length > 0, "expected form() to render structured text pieces");
  assert.ok(
    solved.pieces
      .filter((piece) => piece.fontWeight === "700")
      .map((piece) => String(piece.text || ""))
      .join("") === "bold",
    "expected structured text inline style metadata to survive projection"
  );
  assert.ok(
    solved.pieces
      .filter((piece) => piece._sectionRole === "body-copy" && piece._tokenKind === "emphasis")
      .map((piece) => String(piece.text || ""))
      .join("") === "bold",
    "expected structured text underscore metadata to survive projection"
  );
  const fitted = fit(content, { width: 180, height: 60 });
  assert.ok(fitted.pieces.length > 0, "expected fit() to render structured text pieces");
  assert.equal(typeof fitted.content.complete, "boolean");

  const flowed = flow(content, [
    { width: 180, height: 60 },
    { width: 180, height: 60 }
  ]);
  assert.equal(flowed.placements.length, 2);
  assert.ok(
    flowed.placements.some((placement) => placement.pieces.length > 0),
    "expected flow() to render structured text pieces"
  );

  const poured = pour(content, exclusion.circle({ radius: 58 }), {
    fontSize: 14,
    lineHeight: 1.3
  });
  assert.ok(poured.pieces.length > 0, "expected pour() to render structured text pieces");
  assert.equal(typeof poured.content.complete, "boolean");
});

test("layoutmaster polygon pour remains usable at smaller font sizes", () => {
  const content = "The neon rain of Shibuya did not just reflect the lights; it hummed with a quiet electricity-blue magic. ".repeat(10);
  const shape = exclusion.polygon({
    x: 0,
    y: 0,
    points: [
      [48, 0],
      [420, 36],
      [356, 200],
      [420, 400],
      [84, 360],
      [0, 172]
    ]
  });
  const result = pour(content, shape, {
    fontFamily: "Verdana",
    fontSize: 14,
    lineHeight: 1.2,
    hyphenation: "auto"
  });

  assert.ok(result.pieces.length > 5, "expected polygon pour to return several lines at small sizes");
  assert.ok(
    Number(result.pieces[0]?.y) < 40,
    "expected the first polygon pour line to start near the top instead of collapsing to the bottom edge"
  );
  assert.ok(
    result.content.consumed.length > 120,
    "expected polygon pour to consume more than a single short line at small sizes"
  );
});

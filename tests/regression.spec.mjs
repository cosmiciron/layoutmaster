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
const {
  form,
  fit,
  flow,
  produce,
  pour,
  exclusion,
  debugBuildHiddenDocument
} = layoutmasterModule;

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

test("layoutmaster produce returns engine-paginated pages with projected pieces", () => {
  const source = {
    layout: {
      pageSize: { width: 180, height: 110 },
      margins: { top: 10, right: 12, bottom: 10, left: 12 },
      fontFamily: "Times New Roman",
      fontSize: 14,
      lineHeight: 1.25,
      hyphenation: "off"
    },
    fonts: {
      regular: "Times New Roman"
    },
    styles: {
      p: {
        marginBottom: 8,
        allowLineSplit: true,
        orphans: 1,
        widows: 1
      }
    },
    elements: [
      {
        type: "p",
        content: "Produce exposes full engine pagination as page-wrapped pieces. ".repeat(12),
        properties: {
          sourceId: "produce-body",
          _demoRole: "body"
        }
      }
    ]
  };

  const result = produce(source);

  assert.ok(result.pages.length > 1, "expected produce() to preserve engine pagination");
  assert.equal(result.pages[0].width, 180);
  assert.equal(result.pages[0].height, 110);
  assert.ok(result.pages.some((page) => page.pieces.length > 0), "expected pages to include projected pieces");
  assert.ok(
    result.pages.flatMap((page) => page.pieces).some((piece) => piece._demoRole === "body"),
    "expected produce() pieces to keep underscore metadata"
  );
  assertPerformanceShape(result.performance, "produce");
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

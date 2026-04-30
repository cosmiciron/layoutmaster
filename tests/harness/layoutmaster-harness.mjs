import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installFakeCanvas } from "./fake-canvas.mjs";

installFakeCanvas();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const fixturesRoot = path.join(repoRoot, "tests", "fixtures");
const regressionDir = path.join(fixturesRoot, "regression");
const performanceBaselinePath = path.join(fixturesRoot, "performance-baseline.json");

const layoutmasterModule = await import(pathToFileURL(path.join(repoRoot, "src", "index.js")).href);
const { form, fit, flow } = layoutmasterModule;

export { repoRoot, fixturesRoot, regressionDir, performanceBaselinePath };

function roundNumber(value) {
  return Number(Number(value || 0).toFixed(3));
}

function simplifyPiece(piece) {
  const simplified = {
    x: roundNumber(piece.x),
    y: roundNumber(piece.y),
    width: roundNumber(piece.width),
    height: roundNumber(piece.height),
    lineIndex: Number(piece.lineIndex || 0),
    pieceIndex: Number(piece.pieceIndex || 0),
    kind: String(piece.kind || "text")
  };

  if (piece.text !== undefined) simplified.text = String(piece.text);
  if (piece.direction !== undefined) simplified.direction = String(piece.direction);
  if (piece.shape !== undefined) simplified.shape = String(piece.shape);

  return simplified;
}

function simplifyFormResult(result) {
  return {
    height: roundNumber(result.height),
    pieceCount: Array.isArray(result.pieces) ? result.pieces.length : 0,
    pieces: Array.isArray(result.pieces) ? result.pieces.map(simplifyPiece) : []
  };
}

function simplifyFitResult(result) {
  const content = result.content || {};
  return {
    content: {
      consumed: {
        text: String(content.consumed?.text || ""),
        length: Number(content.consumed?.length || 0)
      },
      remaining: {
        text: String(content.remaining?.text || ""),
        length: Number(content.remaining?.length || 0)
      },
      complete: Boolean(content.complete),
      hyphenated: Boolean(content.hyphenated),
      sourceLength: Number(content.sourceLength || 0)
    },
    pieceCount: Array.isArray(result.pieces) ? result.pieces.length : 0,
    pieces: Array.isArray(result.pieces) ? result.pieces.map(simplifyPiece) : []
  };
}

function simplifyFlowPlacement(placement) {
  const content = placement.content || {};
  return {
    index: Number(placement.index || 0),
    content: {
      consumed: {
        text: String(content.consumed?.text || ""),
        length: Number(content.consumed?.length || 0)
      },
      remaining: {
        text: String(content.remaining?.text || ""),
        length: Number(content.remaining?.length || 0)
      },
      complete: Boolean(content.complete),
      hyphenated: Boolean(content.hyphenated),
      sourceLength: Number(content.sourceLength || 0)
    },
    pieceCount: Array.isArray(placement.pieces) ? placement.pieces.length : 0,
    pieces: Array.isArray(placement.pieces) ? placement.pieces.map(simplifyPiece) : []
  };
}

function simplifyFlowResult(result) {
  const content = result.content || {};
  return {
    content: {
      consumed: {
        text: String(content.consumed?.text || ""),
        length: Number(content.consumed?.length || 0)
      },
      remaining: {
        text: String(content.remaining?.text || ""),
        length: Number(content.remaining?.length || 0)
      },
      complete: Boolean(content.complete),
      hyphenated: Boolean(content.hyphenated),
      sourceLength: Number(content.sourceLength || 0)
    },
    placementCount: Array.isArray(result.placements) ? result.placements.length : 0,
    placements: Array.isArray(result.placements) ? result.placements.map(simplifyFlowPlacement) : []
  };
}

export function loadRegressionFixtures() {
  return fs.readdirSync(regressionDir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".snapshot.json"))
    .sort()
    .map((name) => {
      const fullPath = path.join(regressionDir, name);
      return {
        name,
        path: fullPath,
        snapshotPath: fullPath.replace(/\.json$/, ".snapshot.json"),
        payload: JSON.parse(fs.readFileSync(fullPath, "utf8"))
      };
    });
}

export function runFixture(fixture) {
  const mode = String(fixture.payload.mode || "").trim();
  if (mode === "form") {
    const result = form(fixture.payload.content || "", fixture.payload.options || {});
    return {
      mode,
      actual: simplifyFormResult(result),
      performance: result.performance
    };
  }
  if (mode === "fit") {
    const result = fit(fixture.payload.content || "", fixture.payload.options || {});
    return {
      mode,
      actual: simplifyFitResult(result),
      performance: result.performance
    };
  }
  if (mode === "flow") {
    const result = flow(fixture.payload.content || "", fixture.payload.targets || []);
    return {
      mode,
      actual: simplifyFlowResult(result),
      performance: result.performance
    };
  }
  throw new Error(`[layoutmaster-test] Unsupported fixture mode "${mode}" in ${fixture.name}`);
}

export function assertPerformanceShape(performance, fixtureName) {
  assert.ok(performance && typeof performance === "object", `${fixtureName}: missing performance object`);
  for (const key of [
    "layoutMs",
    "materializeMs",
    "resolveLinesMs",
    "wrapStreamMs",
    "actorMeasurementMs",
    "textMeasurementCacheHits",
    "textMeasurementCacheMisses",
    "colliderFieldQueryCalls",
    "colliderFieldNarrowphaseCalls"
  ]) {
    const value = Number(performance[key]);
    assert.ok(Number.isFinite(value), `${fixtureName}: performance.${key} should be finite`);
    assert.ok(value >= 0, `${fixtureName}: performance.${key} should be non-negative`);
  }
}

export function readSnapshot(snapshotPath) {
  return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
}

export function writeSnapshot(snapshotPath, snapshot) {
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export function benchmarkFixture(fixture, iterations = 12, warmupIterations = 3) {
  for (let index = 0; index < warmupIterations; index += 1) {
    runFixture(fixture);
  }

  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const { performance: perf } = runFixture(fixture);
    const elapsedMs = performance.now() - startedAt;
    samples.push({
      elapsedMs,
      layoutMs: Number(perf.layoutMs || 0),
      wrapStreamMs: Number(perf.wrapStreamMs || 0)
    });
  }

  const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const max = (values) => values.reduce((peak, value) => Math.max(peak, value), 0);

  return {
    iterations,
    warmupIterations,
    averageElapsedMs: roundNumber(average(samples.map((sample) => sample.elapsedMs))),
    peakElapsedMs: roundNumber(max(samples.map((sample) => sample.elapsedMs))),
    averageLayoutMs: roundNumber(average(samples.map((sample) => sample.layoutMs))),
    averageWrapStreamMs: roundNumber(average(samples.map((sample) => sample.wrapStreamMs)))
  };
}

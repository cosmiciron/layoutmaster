import assert from "node:assert/strict";
import fs from "node:fs";

import {
  benchmarkFixture,
  loadRegressionFixtures,
  performanceBaselinePath
} from "./harness/layoutmaster-harness.mjs";

const updateBaseline =
  process.argv.includes("--update-performance-baseline")
  || process.env.LAYOUTMASTER_UPDATE_PERFORMANCE_BASELINE === "1";

const baseline = JSON.parse(fs.readFileSync(performanceBaselinePath, "utf8"));
const fixtures = loadRegressionFixtures();
const results = [];

for (const fixture of fixtures) {
  const limits = baseline.cases[fixture.name];
  assert.ok(limits, `[layoutmaster-benchmark] Missing performance baseline for ${fixture.name}`);
  const result = benchmarkFixture(fixture, limits.iterations, limits.warmupIterations);
  results.push({ fixture: fixture.name, ...result });
}

if (updateBaseline) {
  const nextBaseline = {
    version: baseline.version || 1,
    cases: Object.fromEntries(results.map((result) => [
      result.fixture,
      {
        iterations: baseline.cases[result.fixture]?.iterations ?? result.iterations,
        warmupIterations: baseline.cases[result.fixture]?.warmupIterations ?? result.warmupIterations,
        maxAverageElapsedMs: Number((result.averageElapsedMs * 2.5).toFixed(3)),
        maxPeakElapsedMs: Number((result.peakElapsedMs * 2.5).toFixed(3))
      }
    ]))
  };
  fs.writeFileSync(performanceBaselinePath, `${JSON.stringify(nextBaseline, null, 2)}\n`);
  console.log(JSON.stringify({ updated: true, results, baseline: nextBaseline }, null, 2));
  process.exit(0);
}

for (const result of results) {
  const limits = baseline.cases[result.fixture];
  assert.ok(
    result.averageElapsedMs <= limits.maxAverageElapsedMs,
    `[layoutmaster-benchmark] ${result.fixture} average elapsed ${result.averageElapsedMs}ms exceeded ${limits.maxAverageElapsedMs}ms`
  );
  assert.ok(
    result.peakElapsedMs <= limits.maxPeakElapsedMs,
    `[layoutmaster-benchmark] ${result.fixture} peak elapsed ${result.peakElapsedMs}ms exceeded ${limits.maxPeakElapsedMs}ms`
  );
}

console.log(JSON.stringify({ updated: false, results }, null, 2));


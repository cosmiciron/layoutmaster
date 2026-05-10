import test from "node:test";
import assert from "node:assert/strict";

import {
  assertVmprintIntegrityPrerequisites,
  loadVmprintRegressionFixtures,
  runVmprintRegressionFixture
} from "./harness/vmprint-integrity-harness.mjs";

assertVmprintIntegrityPrerequisites();

const fixtures = loadVmprintRegressionFixtures();

test("embedded engine matches non-scripting vmprint regression snapshots", async (t) => {
  for (const fixture of fixtures) {
    await t.test(fixture.name, async () => {
      const actual = await runVmprintRegressionFixture(fixture);
      assert.deepStrictEqual(actual, fixture.expected);
    });
  }
});

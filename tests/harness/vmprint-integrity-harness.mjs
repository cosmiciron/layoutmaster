import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const projectsRoot = path.resolve(repoRoot, "..");

const vmprintRoot = path.resolve(process.env.LAYOUTMASTER_VMPRINT_ROOT || path.join(projectsRoot, "vmprint"));
const vmprintFontManagersRoot = path.resolve(
  process.env.LAYOUTMASTER_VMPRINT_FONT_MANAGERS_ROOT || path.join(vmprintRoot, "font-managers")
);

const vmprintEngineDistPath = path.join(vmprintRoot, "engine", "dist", "index.mjs");
const vmprintRegressionDir = path.join(vmprintRoot, "engine", "tests", "fixtures", "regression");
const vmprintLocalFontManagerDistPath = path.join(vmprintFontManagersRoot, "local", "dist", "index.js");
const embeddedEngineDistPath = path.join(repoRoot, "engine", "dist", "core", "index.mjs");

function roundNumber(value) {
  return Number(Number(value || 0).toFixed(6));
}

function snapshotPages(pages) {
  return pages.map((page) => ({
    index: page.index,
    width: page.width,
    height: page.height,
    boxes: page.boxes.map((box) => ({
      type: box.type,
      x: roundNumber(box.x),
      y: roundNumber(box.y),
      w: roundNumber(box.w),
      h: roundNumber(box.h),
      lines: (box.lines || []).map((line) => line.map((segment) => ({
        text: segment.text,
        width: roundNumber(segment.width),
        ascent: roundNumber(segment.ascent),
        descent: roundNumber(segment.descent),
        fontFamily: segment.fontFamily || ""
      })))
    }))
  }));
}

function requirePath(existingPath, message) {
  assert.ok(fs.existsSync(existingPath), `${message}\nMissing path: ${existingPath}`);
}

function isScriptingFixture(rawSource) {
  return /(^|\n)---[\s\S]*?\nmethods\s*:/m.test(rawSource)
    || /"methods"\s*:|"scriptVars"\s*:|"onBeforeLayout"\s*:|"onAfterSettle"\s*:/m.test(rawSource);
}

export function assertVmprintIntegrityPrerequisites() {
  requirePath(
    embeddedEngineDistPath,
    "[layoutmaster-engine-integrity] Embedded engine is not built. Run `npm run build:engine` in layoutmaster first."
  );
  requirePath(
    vmprintEngineDistPath,
    "[layoutmaster-engine-integrity] VMPrint engine dist is missing. Run `npm run build --workspace=engine` in the sibling vmprint repo first."
  );
  requirePath(
    vmprintRegressionDir,
    "[layoutmaster-engine-integrity] VMPrint regression fixtures directory is missing."
  );
  requirePath(
    vmprintLocalFontManagerDistPath,
    "[layoutmaster-engine-integrity] Local font manager dist is missing. Run `npm run build --workspace=@vmprint/local-fonts` in the sibling vmprint monorepo first."
  );
}

let moduleCachePromise = null;

async function loadModules() {
  if (moduleCachePromise) return moduleCachePromise;
  moduleCachePromise = (async () => {
    assertVmprintIntegrityPrerequisites();

    const embeddedEngineModule = await import(pathToFileURL(embeddedEngineDistPath).href);
    const vmprintEngineModule = await import(pathToFileURL(vmprintEngineDistPath).href);
    const localFontManagerModule = await import(pathToFileURL(vmprintLocalFontManagerDistPath).href);

    const LocalFontManager = localFontManagerModule.LocalFontManager || localFontManagerModule.default;
    assert.equal(
      typeof LocalFontManager,
      "function",
      "[layoutmaster-engine-integrity] Could not load LocalFontManager constructor from vmprint/font-managers/local."
    );

    return {
      LayoutEngine: embeddedEngineModule.LayoutEngine,
      createPrintEngineRuntime: vmprintEngineModule.createPrintEngineRuntime,
      resolveDocumentSourceText: vmprintEngineModule.resolveDocumentSourceText,
      toLayoutConfig: vmprintEngineModule.toLayoutConfig,
      LocalFontManager
    };
  })();

  return moduleCachePromise;
}

export function loadVmprintRegressionFixtures() {
  assertVmprintIntegrityPrerequisites();

  return fs.readdirSync(vmprintRegressionDir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".snapshot.layout.json"))
    .sort()
    .map((name) => {
      const fixturePath = path.join(vmprintRegressionDir, name);
      const snapshotPath = path.join(vmprintRegressionDir, name.replace(/\.json$/, ".snapshot.layout.json"));
      return {
        name,
        fixturePath,
        snapshotPath,
        fixtureRaw: fs.readFileSync(fixturePath, "utf8"),
        expected: JSON.parse(fs.readFileSync(snapshotPath, "utf8"))
      };
    })
    .filter((fixture) => !isScriptingFixture(fixture.fixtureRaw));
}

export async function runVmprintRegressionFixture(fixture) {
  const {
    LayoutEngine,
    createPrintEngineRuntime,
    resolveDocumentSourceText,
    toLayoutConfig,
    LocalFontManager
  } = await loadModules();

  const document = resolveDocumentSourceText(fixture.fixtureRaw, fixture.fixturePath);
  const engine = new LayoutEngine(
    toLayoutConfig(document, false),
    createPrintEngineRuntime({ fontManager: new LocalFontManager() })
  );

  await engine.waitForFonts();

  return snapshotPages(engine.simulate(document.elements || []));
}

export {
  repoRoot,
  vmprintRoot,
  vmprintFontManagersRoot,
  vmprintRegressionDir
};

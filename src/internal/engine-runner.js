import {
  LayoutEngine,
  createEngineRuntime,
  loadDocument,
  setDefaultEngineRuntime,
  toLayoutConfig
} from "../../engine/dist/core/index.mjs";
import {
  createBrowserTextDelegate,
  getBrowserFallbackFontEntries,
  resolveBrowserMeasurementFontBySrc,
  warmBrowserMeasurementFont
} from "../browser-runtime.js";
import { readEmbeddedEngineReport } from "./engine-report-helper.js";

let sharedBrowserTextDelegate = null;
let sharedBrowserRuntime = null;
const sharedBrowserFaceCache = Object.create(null);
const sharedBrowserMeasurementCache = new Map();

function collectFamiliesToWarm(config) {
  const families = new Set();
  families.add(config.layout.fontFamily);

  for (const family of Object.values(config.fonts || {})) {
    if (family) {
      families.add(family);
    }
  }

  for (const style of Object.values(config.styles || {})) {
    if (style && style.fontFamily) {
      families.add(style.fontFamily);
    }
  }

  for (const family of config.preloadFontFamilies || []) {
    if (family) {
      families.add(family);
    }
  }

  return Array.from(families);
}

function collectMetricStylesToWarm(config) {
  const styles = [{
    fontFamily: config.layout.fontFamily,
    fontSize: config.layout.fontSize,
    lineHeight: config.layout.lineHeight,
    lineHeightMode: config.layout.lineHeightMode
  }];

  for (const style of Object.values(config.styles || {})) {
    if (!style || typeof style !== "object") {
      continue;
    }
    styles.push({
      fontFamily: style.fontFamily || config.layout.fontFamily,
      fontSize: Number(style.fontSize || config.layout.fontSize),
      lineHeight: Number(style.lineHeight || config.layout.lineHeight),
      lineHeightMode: style.lineHeightMode || config.layout.lineHeightMode
    });
  }

  return styles.filter((style) =>
    String(style.lineHeightMode || "css") === "css"
    && Number.isFinite(Number(style.fontSize))
    && Number(style.fontSize) > 0
    && Number.isFinite(Number(style.lineHeight))
    && Number(style.lineHeight) > 0
  );
}

function warmCssMetricCaches(config, textDelegate, runtime) {
  if (typeof textDelegate.measureCssBaselineOffset !== "function") {
    return;
  }

  for (const style of collectMetricStylesToWarm(config)) {
    for (const font of textDelegate.getFontsByFamily(style.fontFamily)) {
      const face = runtime.textDelegateState.faceCache[font.src] ?? resolveBrowserMeasurementFontBySrc(font.src);
      if (!face) {
        continue;
      }
      textDelegate.measureCssBaselineOffset({
        fontFamily: face.browserFamily || face.family,
        fontSize: Number(style.fontSize),
        fontWeight: face.weight || font.weight || 400,
        fontStyle: face.style || font.style || "normal",
        lineHeight: Number(style.lineHeight) * Number(style.fontSize)
      });
    }
  }
}

function ensureSynchronousBrowserRuntime(config) {
  if (!sharedBrowserRuntime) {
    const textDelegate = sharedBrowserTextDelegate ?? createBrowserTextDelegate();
    sharedBrowserTextDelegate = textDelegate;
    sharedBrowserRuntime = createEngineRuntime({ textDelegate });
    sharedBrowserRuntime.measurementCache = sharedBrowserMeasurementCache;
    sharedBrowserRuntime.textDelegateState.faceCache = sharedBrowserFaceCache;
  }

  const runtime = sharedBrowserRuntime;
  const textDelegate = runtime.textDelegate;

  const families = collectFamiliesToWarm(config);
  for (const family of families) {
    for (const font of textDelegate.getFontsByFamily(family)) {
      if (!(font.src in sharedBrowserFaceCache)) {
        const face = resolveBrowserMeasurementFontBySrc(font.src);
        if (face) {
          warmBrowserMeasurementFont(face);
          sharedBrowserFaceCache[font.src] = face;
        }
      }
    }
  }

  for (const fallback of getBrowserFallbackFontEntries()) {
    if (!(fallback.src in sharedBrowserFaceCache)) {
      const face = resolveBrowserMeasurementFontBySrc(fallback.src);
      if (face) {
        warmBrowserMeasurementFont(face);
        sharedBrowserFaceCache[fallback.src] = face;
      }
    }
  }

  warmCssMetricCaches(config, textDelegate, runtime);
  setDefaultEngineRuntime(runtime);
  return runtime;
}

function createEmbeddedLayout(documentInput) {
  const document = loadDocument(documentInput, "layoutmaster");
  const config = toLayoutConfig(document, false);
  config.layout.emitInteractionMap = false;
  config.runtimeHints = {
    ...(config.runtimeHints || {}),
    collectObserverArtifacts: false
  };
  return {
    config,
    elements: document.elements
  };
}

export function createEmbeddedEngineRunner(documentInput) {
  const layout = createEmbeddedLayout(documentInput);
  const config = layout.config;
  ensureSynchronousBrowserRuntime(config);
  const engine = new LayoutEngine(config);

  return {
    config,
    run(options = {}) {
      const pages = engine.simulate(layout.elements, options);
      return {
        pages,
        engineReport: readEmbeddedEngineReport(engine)
      };
    }
  };
}

const BROWSER_FONT_ALIASES = {
  times: "Tinos",
  "times new roman": "Tinos",
  timesnewroman: "Tinos",
  "times-roman": "Tinos",
  arial: "Arimo",
  helvetica: "Arimo",
  "helvetica neue": "Arimo",
  helveticaneue: "Arimo",
  serif: "Tinos",
  "courier new": "Cousine",
  couriernew: "Cousine",
  courier: "Courier",
  monospace: "Cousine",
  calibri: "Carlito",
  cambria: "Caladea",
  "segoe ui": "Carlito",
  "sans-serif": "Noto Sans",
  "sans serif": "Noto Sans",
  symbol: "Noto Sans Symbols 2",
  zapfdingbats: "Noto Sans Symbols 2",
  "zapf dingbats": "Noto Sans Symbols 2",
  "microsoft yahei": "Noto Sans SC",
  simhei: "Noto Sans SC",
  heiti: "Noto Sans SC",
  "heiti sc": "Noto Sans SC",
  songti: "Noto Serif SC",
  "songti sc": "Noto Serif SC",
  simsun: "Noto Serif SC",
  stsong: "Noto Serif SC",
  "hiragino sans": "Noto Sans JP",
  "yu gothic": "Noto Sans JP",
  "malgun gothic": "Noto Sans KR",
  "apple sd gothic neo": "Noto Sans KR"
};

const BROWSER_FONT_FAMILIES = {
  Arimo: {
    browserFamily: "Arial, sans-serif",
    unicodeRange: "U+0000-00FF,U+0100-024F,U+1E00-1EFF"
  },
  Helvetica: {
    browserFamily: "Arial, sans-serif",
    unicodeRange: "U+0000-00FF,U+0100-024F,U+1E00-1EFF"
  },
  Tinos: {
    browserFamily: "\"Times New Roman\", serif",
    unicodeRange: "U+0000-00FF,U+0100-024F,U+1E00-1EFF"
  },
  Times: {
    browserFamily: "\"Times New Roman\", serif",
    unicodeRange: "U+0000-00FF,U+0100-024F,U+1E00-1EFF"
  },
  Cousine: {
    browserFamily: "\"Courier New\", monospace",
    unicodeRange: "U+0000-00FF,U+0100-024F"
  },
  Courier: {
    browserFamily: "\"Courier New\", monospace",
    unicodeRange: "U+0000-00FF,U+0100-024F"
  },
  Carlito: {
    browserFamily: "Calibri, Arial, sans-serif",
    unicodeRange: "U+0000-00FF,U+0100-024F"
  },
  Caladea: {
    browserFamily: "Cambria, \"Times New Roman\", serif",
    unicodeRange: "U+0000-00FF,U+0100-024F"
  },
  "Noto Sans": {
    browserFamily: "\"Noto Sans\", \"Segoe UI\", Arial, sans-serif",
    unicodeRange: "U+0000-024F,U+0370-052F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF,U+2C60-2C7F,U+A720-A7FF"
  },
  "Noto Sans SC": {
    browserFamily: "\"Noto Sans SC\", \"Microsoft YaHei\", \"PingFang SC\", \"Hiragino Sans GB\", sans-serif",
    unicodeRange: "U+2E80-2EFF,U+2F00-2FDF,U+3000-303F,U+3100-312F,U+3190-31EF,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF",
    fallback: true
  },
  "Noto Serif SC": {
    browserFamily: "\"Noto Serif SC\", SimSun, Songti, serif",
    unicodeRange: "U+2E80-2EFF,U+2F00-2FDF,U+3000-303F,U+3100-312F,U+3190-31EF,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF",
    fallback: true
  },
  "Noto Sans JP": {
    browserFamily: "\"Noto Sans JP\", \"Hiragino Sans\", \"Yu Gothic\", Meiryo, sans-serif",
    unicodeRange: "U+3000-303F,U+3040-30FF,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF",
    fallback: true
  },
  "Noto Sans KR": {
    browserFamily: "\"Noto Sans KR\", \"Malgun Gothic\", \"Apple SD Gothic Neo\", sans-serif",
    unicodeRange: "U+3000-303F,U+3130-318F,U+3400-4DBF,U+4E00-9FFF,U+AC00-D7AF,U+F900-FAFF,U+FF00-FFEF",
    fallback: true
  },
  "Noto Sans Arabic": {
    browserFamily: "\"Noto Sans Arabic\", Tahoma, \"Segoe UI\", sans-serif",
    unicodeRange: "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF",
    fallback: true
  },
  "Noto Sans Hebrew": {
    browserFamily: "\"Noto Sans Hebrew\", \"Segoe UI\", Arial, sans-serif",
    unicodeRange: "U+0590-05FF,U+FB1D-FB4F",
    fallback: true
  },
  "Noto Sans Devanagari": {
    browserFamily: "\"Noto Sans Devanagari\", \"Nirmala UI\", \"Kohinoor Devanagari\", sans-serif",
    unicodeRange: "U+0900-097F,U+A8E0-A8FF",
    fallback: true
  },
  "Noto Sans Bengali": {
    browserFamily: "\"Noto Sans Bengali\", \"Nirmala UI\", sans-serif",
    unicodeRange: "U+0980-09FF",
    fallback: true
  },
  "Noto Sans Thai": {
    browserFamily: "\"Noto Sans Thai\", Tahoma, \"Leelawadee UI\", sans-serif",
    unicodeRange: "U+0E00-0E7F",
    fallback: true
  },
  "Noto Sans Symbols 2": {
    browserFamily: "\"Noto Sans Symbols 2\", \"Segoe UI Symbol\", \"Apple Symbols\", sans-serif",
    unicodeRange: "U+2000-2BFF,U+FB00-FFFF",
    fallback: true
  }
};

function createCanvasMeasurementContext() {
  if (typeof OffscreenCanvas !== "undefined") {
    const context = new OffscreenCanvas(1, 1).getContext("2d");
    if (context) return context;
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) return context;
  }
  throw new Error("[layoutmaster] Browser canvas APIs are unavailable.");
}

function normalizeFamilyKey(family) {
  return String(family || "")
    .trim()
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/\s+/g, " ");
}

function resolveFamilyAlias(family) {
  const normalized = normalizeFamilyKey(family);
  return BROWSER_FONT_ALIASES[normalized] || String(family || "");
}

function quoteFontFamily(family) {
  if (!family) return "sans-serif";
  if (family.includes(",")) {
    return family.split(",").map((part) => quoteFontFamily(part.trim())).join(", ");
  }
  if (/^['"].*['"]$/.test(family)) return family;
  if (/^[a-z-]+$/i.test(family)) return family;
  return `"${family.replace(/"/g, "\\\"")}"`;
}

function getClusterCodePoints(cluster) {
  const codePoints = [];
  for (const ch of String(cluster || "")) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) codePoints.push(cp);
  }
  return codePoints;
}

function isIgnorableCodePoint(codePoint) {
  return (
    codePoint === 0x200c ||
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
}

function parseUnicodeRange(unicodeRange) {
  if (!unicodeRange) return [];
  return unicodeRange
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const match = /^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i.exec(part);
      if (!match) return [];
      if (match[1].includes("?")) {
        const start = Number.parseInt(match[1].replace(/\?/g, "0"), 16);
        const end = Number.parseInt(match[1].replace(/\?/g, "F"), 16);
        return [[start, end]];
      }
      const start = Number.parseInt(match[1], 16);
      const end = Number.parseInt(match[2] || match[1], 16);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
      return [[start, end]];
    });
}

function unicodeRangeContainsCodePoint(unicodeRange, codePoint) {
  if (!unicodeRange) return true;
  const ranges = parseUnicodeRange(unicodeRange);
  if (ranges.length === 0) return true;
  return ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

function createFontEntry(family, weight = 400, style = "normal") {
  const resolvedFamily = resolveFamilyAlias(family);
  const base = BROWSER_FONT_FAMILIES[resolvedFamily] || {
    browserFamily: family,
    unicodeRange: undefined,
    fallback: false
  };
  return {
    name: `${resolvedFamily} ${style === "italic" ? "Italic" : weight >= 700 ? "Bold" : "Regular"}`,
    family: resolvedFamily,
    weight,
    style,
    src: `browser:${resolvedFamily}:${weight}:${style}`,
    unicodeRange: base.unicodeRange,
    enabled: true,
    fallback: Boolean(base.fallback),
    browserFamily: base.browserFamily
  };
}

function toBrowserMeasurementFontRef(entry) {
  return {
    measurementBackend: "canvas",
    name: entry.name,
    family: entry.family,
    browserFamily: entry.browserFamily,
    weight: entry.weight,
    style: entry.style,
    src: entry.src,
    unicodeRange: entry.unicodeRange,
    _vmFontKey: `${entry.family}|${entry.weight}|${entry.style}|${entry.src}`
  };
}

function resolveBrowserMeasurementFontBySrc(src) {
  const match = /^browser:(.*?):(\d+):(normal|italic)$/.exec(String(src || ""));
  if (!match) return null;
  return toBrowserMeasurementFontRef(createFontEntry(match[1], Number(match[2]), match[3]));
}

function buildCanvasFont(font, fontSize) {
  return `${font.style || "normal"} ${String(font.weight ?? 400)} ${Math.max(0, fontSize)}px ${quoteFontFamily(font.browserFamily)}`;
}

function resolveMetricAscent(metrics, fallback) {
  return Number(
    metrics.fontBoundingBoxAscent ??
    metrics.emHeightAscent ??
    metrics.actualBoundingBoxAscent ??
    fallback
  );
}

function resolveMetricDescent(metrics, fallback) {
  return Number(
    metrics.fontBoundingBoxDescent ??
    metrics.emHeightDescent ??
    metrics.actualBoundingBoxDescent ??
    fallback
  );
}

const browserVerticalMetricsCache = new Map();
const browserCssBaselineOffsetCache = new Map();

function measureBrowserCssBaselineOffset({ fontFamily, fontSize, fontWeight, fontStyle, lineHeight }) {
  if (
    typeof document === "undefined"
    || typeof document.createElement !== "function"
    || !document.body
  ) {
    return null;
  }

  const resolvedFontFamily = fontFamily || "serif";
  const resolvedFontSize = Number(fontSize) || 16;
  const resolvedFontWeight = fontWeight || "400";
  const resolvedFontStyle = fontStyle || "normal";
  const resolvedLineHeight = Number(lineHeight) || resolvedFontSize * 1.2;
  const cacheKey = [
    resolvedFontFamily,
    resolvedFontSize,
    resolvedFontWeight,
    resolvedFontStyle,
    resolvedLineHeight
  ].join("|");
  if (browserCssBaselineOffsetCache.has(cacheKey)) {
    return browserCssBaselineOffsetCache.get(cacheKey);
  }

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.left = "-10000px";
  probe.style.top = "0";
  probe.style.visibility = "hidden";
  probe.style.fontFamily = resolvedFontFamily;
  probe.style.fontSize = `${resolvedFontSize}px`;
  probe.style.fontWeight = resolvedFontWeight;
  probe.style.fontStyle = resolvedFontStyle;
  probe.style.lineHeight = `${resolvedLineHeight}px`;
  probe.style.whiteSpace = "pre";
  probe.textContent = "Hg";

  const marker = document.createElement("span");
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.height = "0";
  marker.style.padding = "0";
  marker.style.margin = "0";
  marker.style.border = "0";
  marker.style.verticalAlign = "baseline";
  marker.setAttribute("aria-hidden", "true");
  probe.append(marker);
  document.body.append(probe);

  const probeRect = probe.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const offset = markerRect.top - probeRect.top;
  probe.remove();

  const baselineOffset = Number.isFinite(offset) ? offset : null;
  browserCssBaselineOffsetCache.set(cacheKey, baselineOffset);
  return baselineOffset;
}

class CanvasTextDelegate {
  constructor() {
    this.measurementBackend = "canvas";
    this.context = createCanvasMeasurementContext();
  }

  resolveFamilyAlias(family) {
    return resolveFamilyAlias(family);
  }

  getFontRegistrySnapshot() {
    return Object.keys(BROWSER_FONT_FAMILIES).flatMap((family) => [
      createFontEntry(family, 400, "normal"),
      createFontEntry(family, 700, "normal"),
      createFontEntry(family, 400, "italic"),
      createFontEntry(family, 700, "italic")
    ]).map(({ browserFamily, ...font }) => ({ ...font }));
  }

  getEnabledFallbackFonts() {
    return Object.keys(BROWSER_FONT_FAMILIES)
      .filter((family) => BROWSER_FONT_FAMILIES[family].fallback)
      .map((family) => {
        const entry = createFontEntry(family, 400, "normal");
        return {
          src: entry.src,
          name: entry.name,
          unicodeRange: entry.unicodeRange
        };
      });
  }

  getFontsByFamily(family) {
    const resolvedFamily = resolveFamilyAlias(family);
    return [
      createFontEntry(resolvedFamily, 400, "normal"),
      createFontEntry(resolvedFamily, 700, "normal"),
      createFontEntry(resolvedFamily, 400, "italic"),
      createFontEntry(resolvedFamily, 700, "italic")
    ].map(({ browserFamily, ...font }) => ({ ...font }));
  }

  getFallbackFamilies() {
    return Object.keys(BROWSER_FONT_FAMILIES).filter((family) => BROWSER_FONT_FAMILIES[family].fallback);
  }

  async loadFace(src, state) {
    const cached = this.getCachedFace(src, state);
    if (cached) return cached;
    if (src in state.loadingPromises) {
      return state.loadingPromises[src];
    }
    state.loadingPromises[src] = Promise.resolve().then(() => {
      const face = resolveBrowserMeasurementFontBySrc(src);
      if (!face) {
        throw new Error(`[layoutmaster] No browser font config found for "${src}".`);
      }
      state.faceCache[src] = face;
      return face;
    });
    return state.loadingPromises[src];
  }

  getCachedFace(src, state) {
    return state.faceCache[src];
  }

  getFaceCacheKey(face) {
    if (!face) return "unknown";
    if (!face._vmFontKey) {
      face._vmFontKey = `${face.family}|${face.weight}|${face.style}|${face.src}`;
    }
    return String(face._vmFontKey);
  }

  getVerticalMetrics(font) {
    const cacheKey = this.getFaceCacheKey(font);
    const cached = browserVerticalMetricsCache.get(cacheKey);
    if (cached) return cached;
    this.context.save();
    this.context.font = buildCanvasFont(font, 100);
    this.context.textBaseline = "alphabetic";
    const metrics = this.context.measureText("Hg");
    this.context.restore();
    const resolved = {
      ascent: resolveMetricAscent(metrics, 80) * 10,
      descent: resolveMetricDescent(metrics, 20) * 10
    };
    browserVerticalMetricsCache.set(cacheKey, resolved);
    return resolved;
  }

  resolveCssInlineMetrics(font, fontSize, options = {}) {
    if (options.lineHeightMode !== "css") return null;

    const lineHeight = Number(options.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) return null;

    const resolvedFontSize = Math.max(1, Number(fontSize) || 16);
    const lineHeightPx = lineHeight * resolvedFontSize;
    const baselineOffset = this.measureCssBaselineOffset({
      fontFamily: font?.browserFamily || font?.family || "serif",
      fontSize: resolvedFontSize,
      fontWeight: font?.weight || "400",
      fontStyle: font?.style || "normal",
      lineHeight: lineHeightPx
    });
    if (!Number.isFinite(baselineOffset)) return null;

    const halfLeading = (lineHeightPx - resolvedFontSize) / 2;
    const ascentPx = baselineOffset - halfLeading;
    if (!Number.isFinite(ascentPx) || ascentPx <= 0) return null;

    return {
      ascent: ascentPx * (1000 / resolvedFontSize),
      descent: Math.max(0, resolvedFontSize - ascentPx) * (1000 / resolvedFontSize)
    };
  }

  supportsCluster(font, cluster) {
    if (!font || !cluster) return false;
    for (const cp of getClusterCodePoints(cluster)) {
      if (isIgnorableCodePoint(cp)) continue;
      if (!unicodeRangeContainsCodePoint(font.unicodeRange, cp)) return false;
    }
    return true;
  }

  measure(text, font, fontSize, options = {}) {
    if (!text) {
      const metrics = this.getVerticalMetrics(font);
      const cssMetrics = this.resolveCssInlineMetrics(font, fontSize, options);
      return {
        width: 0,
        glyphs: [],
        ascent: cssMetrics?.ascent ?? metrics.ascent,
        descent: cssMetrics?.descent ?? metrics.descent
      };
    }

    if (!font) {
      throw new Error(`[layoutmaster] Missing browser measurement font for text "${String(text).slice(0, 24)}".`);
    }

    const context = this.context;
    context.save();
    context.font = buildCanvasFont(font, fontSize);
    context.textBaseline = "alphabetic";
    context.direction = options.direction === "rtl" ? "rtl" : "ltr";

    const raw = context.measureText(text);
    const letterSpacing = Number(options.letterSpacing || 0);
    const unitCount = Array.from(text).length;
    const width = raw.width + (unitCount > 1 ? letterSpacing * (unitCount - 1) : 0);
    context.restore();

    const verticalMetrics = this.getVerticalMetrics(font);
    const cssMetrics = this.resolveCssInlineMetrics(font, fontSize, options);
    return {
      width,
      glyphs: [],
      ascent: cssMetrics?.ascent ?? resolveMetricAscent(raw, verticalMetrics.ascent / 10) * (1000 / Math.max(1, fontSize)),
      descent: cssMetrics?.descent ?? resolveMetricDescent(raw, verticalMetrics.descent / 10) * (1000 / Math.max(1, fontSize))
    };
  }

  estimateTextBoundsMetrics(font, text) {
    if (!font || !text) return null;
    this.context.save();
    this.context.font = buildCanvasFont(font, 100);
    this.context.textBaseline = "alphabetic";
    const metrics = this.context.measureText(text);
    this.context.restore();
    const ascent = Number(metrics.actualBoundingBoxAscent || 0) * 10;
    const descent = Number(metrics.actualBoundingBoxDescent || 0) * 10;
    if (!Number.isFinite(ascent) || ascent <= 0 || !Number.isFinite(descent)) return null;
    return { ascent, descent };
  }

  measureCssBaselineOffset(input) {
    return measureBrowserCssBaselineOffset(input);
  }
}

function createBrowserTextDelegate() {
  return new CanvasTextDelegate();
}

export {
  CanvasTextDelegate,
  createBrowserTextDelegate,
  measureBrowserCssBaselineOffset,
  resolveBrowserMeasurementFontBySrc
};

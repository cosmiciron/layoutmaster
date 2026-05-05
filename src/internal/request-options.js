import {
  normalizeInputText,
  normalizeMarginsInput,
  parseCssHyphensValue,
  parseCssLineHeightValue,
  parseCssPxValue
} from "./input-style.js";
import {
  normalizeExclusions
} from "./exclusion-author.js";

export const OPEN_HEIGHT = 10000;
const SUPPORTED_FORMATS = new Set(["plain"]);

export {
  normalizeInputText
} from "./input-style.js";

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function looksLikeVmprintElement(value) {
  return isPlainObject(value) && typeof value.type === "string";
}

function isStructuredContentSource(value) {
  if (Array.isArray(value)) {
    return value.every(looksLikeVmprintElement);
  }
  return isPlainObject(value) && Array.isArray(value.elements) && value.elements.every(looksLikeVmprintElement);
}

function parseStructuredContentString(content) {
  if (typeof content !== "string") {
    return null;
  }
  const source = content.trim();
  if (!source || (source[0] !== "{" && source[0] !== "[")) {
    return null;
  }
  try {
    const parsed = JSON.parse(source);
    return isStructuredContentSource(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isStructuredContentString(content) {
  return parseStructuredContentString(content) !== null;
}

function normalizeFontFamily(fontFamily) {
  return String(fontFamily || "Times New Roman");
}

function normalizePositiveNumber(value, fallback) {
  const numeric = parseFloat(String(value ?? ""));
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1, numeric);
}

function normalizeHeight(value, fallback = OPEN_HEIGHT) {
  const numeric = parseFloat(String(value ?? ""));
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1, numeric);
}

function normalizeHyphenation(value) {
  return parseCssHyphensValue(value) ?? "off";
}

function normalizeDirection(value) {
  const normalized = String(value || "auto").trim().toLowerCase();
  return normalized === "ltr" || normalized === "rtl" ? normalized : "auto";
}

function normalizeLang(value) {
  return String(value || "").trim();
}

function normalizeLineHeightMode(value) {
  const normalized = String(value || "css").trim().toLowerCase();
  if (normalized === "browser") return "css";
  return normalized === "print" ? "print" : "css";
}

function normalizeLineHeightAdjustment(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeFormat(value) {
  const normalized = String(value || "plain").trim().toLowerCase();
  if (!SUPPORTED_FORMATS.has(normalized)) {
    throw new Error(`[layoutmaster] Unsupported format "${normalized}". Core content is always a string; pass structured text as JSON content.`);
  }
  return normalized;
}

function normalizeStyles(value) {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isPlainObject(value)) {
    throw new Error("[layoutmaster] styles must be a plain object when provided.");
  }
  return value;
}

function normalizeMargins(value) {
  if (value === undefined || value === null) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const normalized = normalizeMarginsInput(value);
  if (!normalized) {
    throw new Error("[layoutmaster] margins must be an object with top/right/bottom/left values when provided.");
  }
  return normalized;
}

function mergeStyleMaps(base = {}, overrides = {}) {
  const merged = {
    ...(isPlainObject(base) ? base : {}),
    ...(isPlainObject(overrides) ? overrides : {})
  };

  if (isPlainObject(base?.p) || isPlainObject(overrides?.p)) {
    merged.p = {
      ...(isPlainObject(base?.p) ? base.p : {}),
      ...(isPlainObject(overrides?.p) ? overrides.p : {})
    };
  }

  return merged;
}

function mergeResolvedOptions(base = {}, overrides = {}) {
  return {
    ...base,
    ...overrides,
    ...(base.styles || overrides.styles ? { styles: mergeStyleMaps(base.styles, overrides.styles) } : {})
  };
}

export function normalizeRequest(content = "", options = {}, mode = "form") {
  const normalizedOptions = isPlainObject(options) ? options : {};
  if (typeof content !== "string") {
    throw new Error("[layoutmaster] content must be a string. Pass structured text as JSON content.");
  }
  const structuredSource = parseStructuredContentString(content);
  const contentIsStructured = structuredSource !== null;
  const resolvedFormatInput = normalizedOptions.format ?? "plain";
  const normalizedFormat = normalizeFormat(resolvedFormatInput);
  const normalizedMode = String(mode || "form").trim().toLowerCase() === "fit" ? "fit" : "form";
  const normalizedHeight = normalizeHeight(
    normalizedOptions.height,
    normalizedMode === "form" ? OPEN_HEIGHT : Number.NaN
  );
  if (normalizedMode !== "form" && !Number.isFinite(normalizedHeight)) {
    throw new Error("[layoutmaster] height is required for bounded layout.");
  }
  return {
    content: contentIsStructured ? "" : normalizeInputText(content),
    format: contentIsStructured ? "ast" : normalizedFormat,
    astSource: structuredSource,
    rawContent: content,
    width: normalizePositiveNumber(normalizedOptions.width, 1),
    height: normalizedHeight,
    fontFamily: normalizeFontFamily(normalizedOptions.fontFamily),
    fontSize: parseCssPxValue(normalizedOptions.fontSize) ?? 16,
    lineHeight: parseCssLineHeightValue(
      normalizedOptions.lineHeight,
      parseCssPxValue(normalizedOptions.fontSize) ?? 16
    ) ?? 1.4,
    lineHeightMode: normalizeLineHeightMode(normalizedOptions.lineHeightMode),
    lineHeightAdjustment: normalizeLineHeightAdjustment(normalizedOptions.lineHeightAdjustment),
    lang: normalizeLang(normalizedOptions.lang),
    direction: normalizeDirection(normalizedOptions.direction),
    hyphenation: normalizeHyphenation(normalizedOptions.hyphenation),
    margins: normalizeMargins(normalizedOptions.margins),
    styles: normalizeStyles(normalizedOptions.styles),
    exclusions: normalizeExclusions(normalizedOptions.exclusions)
  };
}

export function resolveTargetOptions(target, mode = "form") {
  if (typeof target === "string") {
    throw new Error("[layoutmaster] CSS string targets are not part of the core API. Pass a plain options object instead.");
  }
  return target || {};
}

export function resolveCallArguments(content, optionsOrHandler, maybeHandler, mode = "form") {
  const handler = typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler;
  const rawOptions = typeof optionsOrHandler === "function" ? {} : (optionsOrHandler || {});
  const options = mergeResolvedOptions({}, resolveTargetOptions(rawOptions, mode));
  return {
    request: normalizeRequest(content, options, mode),
    handler
  };
}

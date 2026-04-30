function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeInputText(text) {
  return String(text || "").replace(/\r\n/g, "\n");
}

export function buildFragmentSourceId(index) {
  return `author:fragment:${index}`;
}

export function buildFragmentModel(text) {
  const normalizedText = normalizeInputText(text);
  const paragraphs = [];
  const separatorPattern = /\n{2,}/g;
  let cursor = 0;
  let paragraphIndex = 0;
  let match;

  while ((match = separatorPattern.exec(normalizedText)) !== null) {
    const paragraphText = normalizedText.slice(cursor, match.index);
    const separator = match[0];

    if (paragraphText.length > 0 || paragraphs.length > 0) {
      const sourceId = buildFragmentSourceId(paragraphIndex);
      paragraphs.push({
        sourceId,
        text: paragraphText,
        start: cursor,
        end: cursor + paragraphText.length,
        separatorAfter: separator,
        separatorLength: separator.length
      });
      paragraphIndex += 1;
    }

    cursor = match.index + separator.length;
  }

  const trailingText = normalizedText.slice(cursor);
  if (trailingText.length > 0 || paragraphs.length === 0) {
    const sourceId = buildFragmentSourceId(paragraphIndex);
    paragraphs.push({
      sourceId,
      text: trailingText,
      start: cursor,
      end: cursor + trailingText.length,
      separatorAfter: "",
      separatorLength: 0
    });
  }

  return {
    normalizedText,
    paragraphs
  };
}

export function parseCssPxValue(value, relativeSize = null) {
  if (value == null || value === "" || value === "auto" || value === "normal") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const str = String(value).trim().toLowerCase();
  if (!str) return null;
  const n = parseFloat(str);
  if (!Number.isFinite(n)) return null;
  if (str.endsWith("rem")) return n * 16;
  if (str.endsWith("em")) {
    const base = Number.isFinite(relativeSize) ? Number(relativeSize) : null;
    return base != null ? n * base : n;
  }
  if (str.endsWith("pt")) return n * (96 / 72);
  if (str.endsWith("%")) {
    const base = Number.isFinite(relativeSize) ? Number(relativeSize) : null;
    return base != null ? (n / 100) * base : null;
  }
  return n;
}

function parseCssLengthValue(value, relativeSize = null) {
  if (value == null || value === "" || value === "auto" || value === "normal") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const str = String(value).trim().toLowerCase();
  if (!str) return null;
  if (/^[-+]?(?:0+|0*\.(?:0+))$/.test(str)) return 0;
  const match = str.match(/^([-+]?(?:\d+|\d*\.\d+))(px|em|rem|pt|%)$/);
  if (!match) return null;
  return parseCssPxValue(str, relativeSize);
}

export function parseCssLineHeightValue(value, resolvedFontSize) {
  if (value == null || value === "" || value === "normal") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const str = String(value).trim();
  if (str.endsWith("%")) {
    const n = parseFloat(str);
    return Number.isFinite(n) ? n / 100 : null;
  }
  if (/[a-z%]+$/i.test(str)) {
    const n = parseCssLengthValue(str, resolvedFontSize);
    const base = Number.isFinite(resolvedFontSize) && resolvedFontSize > 0 ? resolvedFontSize : null;
    return (Number.isFinite(n) && base) ? n / base : null;
  }
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

export function parseCssHyphensValue(value) {
  if (!value) return null;
  const s = String(value).toLowerCase().trim();
  if (s === "auto") return "auto";
  if (s === "manual" || s === "soft") return "soft";
  if (s === "none" || s === "off") return "off";
  return null;
}

export function normalizeMarginsInput(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  const top = parseCssPxValue(value.top);
  const right = parseCssPxValue(value.right);
  const bottom = parseCssPxValue(value.bottom);
  const left = parseCssPxValue(value.left);
  if ([top, right, bottom, left].every((part) => part == null)) {
    return null;
  }
  return {
    top: top ?? 0,
    right: right ?? 0,
    bottom: bottom ?? 0,
    left: left ?? 0
  };
}

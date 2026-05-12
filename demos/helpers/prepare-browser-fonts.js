const preparedFonts = new Map();
let probeRoot = null;

// Demo/app helper, not Layoutmaster API.
// The pure DOMless demos let users choose font stacks without any styled source
// DOM element. This helper asks the browser to resolve that stack before the
// demo takes a synchronous Layoutmaster measurement.

function quoteFontFamily(family) {
  if (!family) return "serif";
  if (family.includes(",")) {
    return family.split(",").map((part) => quoteFontFamily(part.trim())).join(", ");
  }
  if (/^['"].*['"]$/.test(family)) return family;
  if (/^[a-z-]+$/i.test(family)) return family;
  return `"${family.replace(/"/g, "\\\"")}"`;
}

function getProbeRoot() {
  if (typeof document === "undefined" || !document.body) return null;
  if (probeRoot && probeRoot.isConnected) return probeRoot;

  probeRoot = document.createElement("div");
  probeRoot.setAttribute("aria-hidden", "true");
  probeRoot.style.position = "absolute";
  probeRoot.style.left = "-10000px";
  probeRoot.style.top = "0";
  probeRoot.style.width = "1px";
  probeRoot.style.height = "1px";
  probeRoot.style.overflow = "hidden";
  probeRoot.style.visibility = "hidden";
  probeRoot.style.pointerEvents = "none";
  document.body.append(probeRoot);
  return probeRoot;
}

function ensureProbe({ fontFamily, fontSize, fontWeight, fontStyle, text }) {
  const root = getProbeRoot();
  if (!root) return;

  const probe = document.createElement("span");
  probe.style.fontFamily = fontFamily;
  probe.style.fontSize = `${fontSize}px`;
  probe.style.fontWeight = String(fontWeight);
  probe.style.fontStyle = fontStyle;
  probe.style.lineHeight = "1";
  probe.style.whiteSpace = "pre";
  probe.textContent = text;
  root.append(probe);
  probe.getBoundingClientRect();
}

export async function prepareBrowserFonts({
  fontFamily = "serif",
  fontSize = 16,
  fontWeight = 400,
  fontStyle = "normal",
  text = "Hamburgefonstiv 1234567890"
} = {}) {
  const fontSet = typeof document !== "undefined" ? document.fonts : null;
  const resolvedFontFamily = String(fontFamily || "serif").trim() || "serif";
  const resolvedFontSize = Math.max(1, Number(fontSize) || 16);
  const resolvedFontWeight = fontWeight || 400;
  const resolvedFontStyle = fontStyle || "normal";
  const resolvedText = String(text || "Hamburgefonstiv 1234567890");

  ensureProbe({
    fontFamily: resolvedFontFamily,
    fontSize: resolvedFontSize,
    fontWeight: resolvedFontWeight,
    fontStyle: resolvedFontStyle,
    text: resolvedText
  });

  if (!fontSet || typeof fontSet.load !== "function") {
    return "untracked";
  }

  const cssFont = [
    resolvedFontStyle,
    resolvedFontWeight,
    `${resolvedFontSize}px`,
    quoteFontFamily(resolvedFontFamily)
  ].join(" ");
  const key = `${cssFont}|${resolvedText.slice(0, 256)}`;

  if (!preparedFonts.has(key)) {
    preparedFonts.set(
      key,
      fontSet.load(cssFont, resolvedText).then(() => "loaded", () => "fallback")
    );
  }

  const status = await preparedFonts.get(key);
  if (fontSet.ready && fontSet.status === "loading") {
    await fontSet.ready;
  }
  return status === "loaded" ? (fontSet.status || "loaded") : status;
}

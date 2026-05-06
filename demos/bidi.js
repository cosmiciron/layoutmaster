const urlParams = new URLSearchParams(window.location.search);
const runtimeModule = urlParams.has("local")
  ? "/src/index.js"
  : "@layoutmaster/layoutmaster";
const { form } = await import(runtimeModule);

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT_STACK = "Arial, 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Noto Sans Hebrew', 'Noto Sans', sans-serif";
const samples = [
  {
    id: "arabic-mixed",
    label: "Arabic mixed fixture",
    lang: "ar",
    direction: "auto",
    paragraphs: [
      "مرحبا بك في عالم الطباعة المبرمجة.",
      "The word للنشر means 'for publishing' and مرحبا means 'welcome' in Arabic.",
      "تم تصميم VMPrint 0.1.0 لإنتاج مستندات PDF بدقة متناهية.",
      "تتطلب نسبة 100% من المشاريع دقة في الأرقام مثل 123,456 وعلامات الترقيم؟ نعم، بالتأكيد!"
    ]
  },
  {
    id: "rtl-product",
    label: "RTL product names",
    lang: "ar",
    direction: "rtl",
    paragraphs: [
      "تم تصميم Layoutmaster 0.1.3 لإنتاج واجهات HTML دقيقة بدون قياس DOM متكرر.",
      "تظهر الكلمات PDF وCanvas و100% داخل الجملة العربية مع الحفاظ على ترتيبها الداخلي.",
      "هل تبقى علامات الترقيم مثل (123,456) و\"VMPrint\" في موضع منطقي؟ نعم، هذه الصفحة تكشف ذلك."
    ]
  },
  {
    id: "ltr-arabic-islands",
    label: "Arabic inside English",
    lang: "en",
    direction: "ltr",
    paragraphs: [
      "The renderer should keep Arabic islands such as مرحبا بالعالم and للنشر readable inside English copy.",
      "Numbers like 123,456 and versions like Layoutmaster 0.1.3 should remain left-to-right even when surrounded by RTL words.",
      "Closing punctuation after Arabic؟ and English! should not begin a new visual line by itself."
    ]
  },
  {
    id: "hebrew-arabic",
    label: "Hebrew and Arabic",
    lang: "he",
    direction: "auto",
    paragraphs: [
      "בדיקת כיוון: עברית לפני Layoutmaster 0.1.3 ואחריה טקסט נוסף.",
      "Arabic follows: تم تصميم VMPrint لإنتاج مستندات PDF دقيقة.",
      "Mixed punctuation: האם המספר 100% נשאר תקין? نعم، بالتأكيد!"
    ]
  }
];

const sampleInput = document.getElementById("sample-input");
const widthInput = document.getElementById("width-input");
const widthValue = document.getElementById("width-value");
const fontSizeInput = document.getElementById("font-size-input");
const fontSizeValue = document.getElementById("font-size-value");
const directionInput = document.getElementById("direction-input");
const boxesInput = document.getElementById("boxes-input");
const baselinesInput = document.getElementById("baselines-input");
const nativeColumn = document.getElementById("native-column");
const stage = document.getElementById("layoutmaster-stage");
const warning = document.getElementById("warning");
const pieceCount = document.getElementById("piece-count");
const lineCount = document.getElementById("line-count");
const heightValue = document.getElementById("height-value");

let selectedDirection = "auto";
for (const sample of samples) {
  const option = document.createElement("option");
  option.value = sample.id;
  option.textContent = sample.label;
  sampleInput.append(option);
}

applyUrlState();

sampleInput.addEventListener("change", () => {
  const sample = getSelectedSample();
  selectedDirection = sample.direction;
  updateDirectionButtons();
  render();
});
widthInput.addEventListener("input", render);
fontSizeInput.addEventListener("input", render);
boxesInput.addEventListener("change", render);
baselinesInput.addEventListener("change", render);
directionInput.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-direction]");
  if (!button) return;
  selectedDirection = button.dataset.direction;
  updateDirectionButtons();
  render();
});
selectedDirection = getSelectedSample().direction;
if (urlParams.has("dir")) {
  selectedDirection = normalizeChoice(urlParams.get("dir"), ["auto", "ltr", "rtl"], selectedDirection);
}
updateDirectionButtons();
render();

function render() {
  const sample = getSelectedSample();
  const width = Number(widthInput.value);
  const fontSize = Number(fontSizeInput.value);
  const lineHeight = 1.45;
  const content = sample.paragraphs.join("\n");
  const options = {
    width,
    fontFamily: FONT_STACK,
    fontSize,
    lineHeight,
    direction: selectedDirection,
    lang: sample.lang
  };

  widthValue.textContent = String(width);
  fontSizeValue.textContent = String(fontSize);
  document.documentElement.style.setProperty("--column-width", px(width));
  document.documentElement.style.setProperty("--font-size", px(fontSize));
  document.documentElement.style.setProperty("--line-height", String(lineHeight));
  document.documentElement.style.setProperty("--text-font", FONT_STACK);

  renderNative(sample, selectedDirection);

  try {
    const result = form(content, options);
    renderLayoutmaster(result, width);
    renderStats(result);
    validateBounds(result.pieces, width);
  } catch (error) {
    stage.replaceChildren();
    warning.textContent = error instanceof Error ? error.message : String(error);
    warning.dataset.visible = "true";
    pieceCount.textContent = "0";
    lineCount.textContent = "0";
    heightValue.textContent = "0";
  }
}

function renderNative(sample, direction) {
  nativeColumn.replaceChildren();
  nativeColumn.lang = sample.lang;
  nativeColumn.dir = direction === "auto" ? "auto" : direction;
  nativeColumn.style.direction = direction === "auto" ? "" : direction;
  nativeColumn.textContent = sample.paragraphs.join("\n");
}

function renderLayoutmaster(result, width) {
  const height = Math.ceil(Number(result.height || 0));
  stage.replaceChildren();
  stage.style.width = px(width);
  stage.style.height = px(Math.max(160, height));

  for (const piece of result.pieces || []) {
    renderPiece(stage, piece);
  }

  renderChrome(stage, result.pieces || [], result.lines || [], width, Math.max(160, height));
}

function renderPiece(container, piece) {
  if (piece?.kind !== "text") return;

  const metrics = resolveTextMetrics(piece);
  const node = document.createElement("div");
  node.className = "piece";
  node.style.left = px(piece.x);
  node.style.top = px(metrics.top);
  node.style.width = px(piece.width);
  node.style.height = px(metrics.height);
  node.style.lineHeight = px(metrics.height);
  node.style.fontFamily = piece.fontFamily || FONT_STACK;
  node.style.fontSize = px(piece.fontSize);
  node.style.letterSpacing = px(piece.letterSpacing || 0);
  node.style.fontWeight = piece.fontWeight || "";
  node.style.fontStyle = piece.fontStyle || "";
  node.style.color = piece.color || "#1c2023";
  const text = document.createElement("span");
  text.className = "piece-text";
  text.textContent = piece.text || "";
  node.append(text);
  container.append(node);
}

function renderChrome(container, pieces, lines, width, height) {
  const chrome = svg("svg");
  chrome.classList.add("chrome");
  chrome.setAttribute("width", px(width));
  chrome.setAttribute("height", px(height));
  chrome.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (boxesInput.checked) {
    for (const piece of pieces) {
      const box = svg("rect");
      box.classList.add("piece-box");
      box.setAttribute("x", numberAttr(piece.x));
      box.setAttribute("y", numberAttr(piece.y));
      box.setAttribute("width", numberAttr(piece.width));
      box.setAttribute("height", numberAttr(piece.height));
      chrome.append(box);
    }
  }

  if (baselinesInput.checked) {
    for (const line of lines) {
      const baselineY = Number(line?.baselineY);
      const x = Number(line?.x || 0);
      const lineWidth = Number(line?.width || 0);
      if (!Number.isFinite(baselineY) || !Number.isFinite(lineWidth) || lineWidth <= 0) continue;
      const baseline = svg("line");
      baseline.classList.add("baseline");
      baseline.setAttribute("x1", numberAttr(x));
      baseline.setAttribute("y1", numberAttr(baselineY));
      baseline.setAttribute("x2", numberAttr(x + lineWidth));
      baseline.setAttribute("y2", numberAttr(baselineY));
      chrome.append(baseline);
    }
  }

  container.append(chrome);
}

function renderStats(result) {
  pieceCount.textContent = String(result.pieces?.length || 0);
  lineCount.textContent = String(result.lines?.length || 0);
  heightValue.textContent = `${Math.round(Number(result.height || 0))}px`;
}

function validateBounds(pieces, width) {
  const escaped = [];
  for (const piece of pieces || []) {
    const left = Number(piece.x);
    const right = left + Number(piece.width || 0);
    if (left < -0.5 || right > width + 0.5) {
      escaped.push(piece.text || "");
    }
  }

  if (escaped.length === 0) {
    warning.dataset.visible = "false";
    warning.textContent = "";
    return;
  }

  warning.textContent = `Out-of-bounds pieces: ${escaped.slice(0, 4).join(" / ")}`;
  warning.dataset.visible = "true";
}

function resolveTextMetrics(piece) {
  const baselineY = Number(piece?.baselineY);
  const fontSize = Number(piece?.fontSize);
  const ascent = Number(piece?.ascent);
  const descent = Number(piece?.descent);
  if (Number.isFinite(baselineY)
    && Number.isFinite(fontSize)
    && fontSize > 0
    && Number.isFinite(ascent)
    && ascent > 0) {
    const ascentPx = (ascent / 1000) * fontSize;
    const descentPx = Number.isFinite(descent) && descent >= 0
      ? (descent / 1000) * fontSize
      : Math.max(0, Number(piece?.height || 0) - ascentPx);
    return {
      top: baselineY - ascentPx,
      height: Math.max(1, ascentPx + descentPx)
    };
  }

  return {
    top: Number(piece?.y || 0),
    height: Math.max(1, Number(piece?.height || 0))
  };
}

function getSelectedSample() {
  return samples.find((sample) => sample.id === sampleInput.value) || samples[0];
}

function applyUrlState() {
  const sampleId = urlParams.get("sample");
  if (samples.some((sample) => sample.id === sampleId)) {
    sampleInput.value = sampleId;
  }
  setRangeFromUrl(widthInput, "width");
  setRangeFromUrl(fontSizeInput, "fontSize");
  if (urlParams.has("boxes")) {
    boxesInput.checked = urlParams.get("boxes") === "1" || urlParams.get("boxes") === "true";
  }
  if (urlParams.has("baselines")) {
    baselinesInput.checked = urlParams.get("baselines") === "1" || urlParams.get("baselines") === "true";
  }
}

function updateDirectionButtons() {
  for (const button of directionInput.querySelectorAll("button[data-direction]")) {
    button.setAttribute("aria-pressed", button.dataset.direction === selectedDirection ? "true" : "false");
  }
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function setRangeFromUrl(input, key) {
  if (!urlParams.has(key)) return;
  const value = Number(urlParams.get(key));
  const min = Number(input.min);
  const max = Number(input.max);
  if (!Number.isFinite(value)) return;
  input.value = String(Math.min(max, Math.max(min, value)));
}

function svg(tagName) {
  return document.createElementNS(SVG_NS, tagName);
}

function px(value) {
  const numeric = Number(value);
  return `${Number.isFinite(numeric) ? numeric : 0}px`;
}

function numberAttr(value) {
  const numeric = Number(value);
  return String(Number.isFinite(numeric) ? numeric : 0);
}

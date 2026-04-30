class FakeCanvasTextMetrics {
  constructor(width, fontSize) {
    this.width = width;
    this.actualBoundingBoxAscent = fontSize * 0.8;
    this.actualBoundingBoxDescent = fontSize * 0.2;
    this.fontBoundingBoxAscent = fontSize * 0.8;
    this.fontBoundingBoxDescent = fontSize * 0.2;
    this.emHeightAscent = fontSize * 0.8;
    this.emHeightDescent = fontSize * 0.2;
  }
}

function parseFontSize(font) {
  const match = /(\d+(?:\.\d+)?)px/.exec(String(font || ""));
  return match ? Number(match[1]) : 16;
}

function measureCharacterWidth(char, fontSize) {
  if (char === " ") return fontSize * 0.33;
  if (/[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uAC00-\uD7AF]/.test(char)) return fontSize;
  if (/[A-Z]/.test(char)) return fontSize * 0.68;
  if (/[ilI1]/.test(char)) return fontSize * 0.28;
  if (/[mwMW]/.test(char)) return fontSize * 0.82;
  if (/[.,;:!?'"`]/.test(char)) return fontSize * 0.25;
  return fontSize * 0.56;
}

class FakeCanvasContext2D {
  constructor() {
    this.font = "normal 16px serif";
    this.textBaseline = "alphabetic";
    this.direction = "ltr";
  }

  save() {}
  restore() {}

  measureText(text) {
    const fontSize = parseFontSize(this.font);
    let width = 0;
    for (const char of String(text || "")) {
      width += measureCharacterWidth(char, fontSize);
    }
    return new FakeCanvasTextMetrics(width, fontSize);
  }
}

class FakeOffscreenCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  getContext(kind) {
    return kind === "2d" ? new FakeCanvasContext2D() : null;
  }
}

export function installFakeCanvas() {
  if (typeof globalThis.OffscreenCanvas === "undefined") {
    globalThis.OffscreenCanvas = FakeOffscreenCanvas;
  }
}


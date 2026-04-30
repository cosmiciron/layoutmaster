import { exclusion } from "@layoutmaster/layoutmaster";

/**
 * Extract sampled video silhouettes for the Dancing Text demo.
 *
 * Example:
 *
 * ```js
 * const frames = await extractDanceFramesFromVideoFile(file, {
 *   sampleFps: 6,
 *   targetHeight: 360,
 *   bandHeight: 3,
 *   tiers: 3,
 *   gap: 4,
 *   shouldKeepFrame: (frame, previousMask) => true,
 *   onProgress: ({ done, total }) => console.log(done, total)
 * });
 * ```
 *
 * Each returned frame includes an image preview and serialized exclusion JSON.
 * Rehydrate that JSON with `exclusion.fromJSON(...)` before calling `form()`
 * or `pour()`.
 */
export async function extractDanceFramesFromVideoFile(file, options) {
  const loaded = await loadVideoFromFile(file);

  try {
    const { video } = loaded;
    const duration = Number(video.duration || 0);
    const step = 1 / options.sampleFps;
    const timestamps = [];

    for (let time = 0; time < duration; time += step) {
      timestamps.push(Number(time.toFixed(4)));
    }
    if (!timestamps.length || timestamps[timestamps.length - 1] < duration - 0.04) {
      timestamps.push(Math.max(0, duration - 0.001));
    }

    const nextFrames = [];
    let previousMask = null;
    let sampledCount = 0;

    for (let i = 0; i < timestamps.length; i += 1) {
      if (options.isCancelled?.()) {
        return null;
      }

      const timestamp = timestamps[i];
      await seekVideo(video, timestamp);
      const frame = await buildFrameFromCurrentVideo(video, sampledCount, timestamp, options);
      sampledCount += 1;

      options.onProgress?.({
        sampledCount,
        keptCount: nextFrames.length,
        totalCount: timestamps.length,
        timestamp,
        duration,
        label: `Decoding ${timestamp.toFixed(2)}s of ${duration.toFixed(2)}s`
      });

      if (!frame) {
        continue;
      }

      const diff = maskDifferenceRatio(previousMask, frame.normalizedMask);
      const mustKeep = !previousMask || diff >= options.deltaThreshold || i === timestamps.length - 1;
      if (mustKeep) {
        previousMask = frame.normalizedMask;
        nextFrames.push(frame);
      }

      options.onProgress?.({
        sampledCount,
        keptCount: nextFrames.length,
        totalCount: timestamps.length,
        timestamp,
        duration,
        label: `Decoding ${timestamp.toFixed(2)}s of ${duration.toFixed(2)}s`
      });
    }

    if (!nextFrames.length) {
      throw new Error("No usable pose frames were extracted from the video.");
    }

    if (nextFrames.length > 2) {
      const firstMask = nextFrames[0].normalizedMask;
      const lastMask = nextFrames[nextFrames.length - 1].normalizedMask;
      const loopSeamDiff = maskDifferenceRatio(firstMask, lastMask);
      if (loopSeamDiff <= Math.max(0.02, options.deltaThreshold)) {
        nextFrames.pop();
      }
    }

    return nextFrames.map(({ normalizedMask, ...frame }) => frame);
  } finally {
    URL.revokeObjectURL(loaded.url);
  }
}

const MIN_COMPONENT_PIXELS = 2200;
const MIN_COMPONENT_HEIGHT_RATIO = 0.34;
const COMPONENT_JOIN_GAP = 32;
const ALPHA_FEATHER_PX = 3;
const NORMALIZED_COMPARE_WIDTH = 112;
const NORMALIZED_COMPARE_HEIGHT = 112;
const CLEANUP_MIN_COMPONENT_PIXELS = 120;
const BACKGROUND_QUANTIZE_STEP = 16;
const MIN_BACKGROUND_DOMINANCE_RATIO = 0.6;
const MAX_BACKGROUND_SAMPLE_DISTANCE = 30;
const MIN_BACKGROUND_DISTANCE_THRESHOLD = 18;
const MAX_BACKGROUND_DISTANCE_THRESHOLD = 54;
const MIN_SOFT_BACKGROUND_EDGE_RATIO = 0.42;
const SOFT_BACKGROUND_MIN_CHANNEL = 205;
const SOFT_BACKGROUND_MAX_CHROMA = 72;
const MAX_SOFT_BACKGROUND_DISTANCE_THRESHOLD = 96;
const BACKGROUND_DISTANCE_THRESHOLD_PAD = 24;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function loadVideoFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      cleanup();
      resolve({ video, url });
    };
    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load "${file.name}" as a video.`));
    };
    video.src = url;
  });
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const target = clamp(time, 0, Math.max(0, Number(video.duration || 0)));
    if (Math.abs((video.currentTime || 0) - target) < 0.001 && video.readyState >= 2) {
      resolve();
      return;
    }

    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Video seek failed during frame extraction."));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = target;
  });
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

function quantizeChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value / BACKGROUND_QUANTIZE_STEP) * BACKGROUND_QUANTIZE_STEP));
}

function detectSolidBackgroundColor(imageData) {
  const { data, width, height } = imageData;
  if (!width || !height) return null;

  const bins = new Map();
  const seen = new Uint8Array(width * height);
  let sampleCount = 0;

  const addSample = (x, y) => {
    const index = y * width + x;
    if (seen[index]) return;
    seen[index] = 1;

    const offset = index * 4;
    if (data[offset + 3] < 250) {
      return;
    }

    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const key = `${quantizeChannel(r)}|${quantizeChannel(g)}|${quantizeChannel(b)}`;
    let bucket = bins.get(key);
    if (!bucket) {
      bucket = { count: 0, sumR: 0, sumG: 0, sumB: 0, samples: [] };
      bins.set(key, bucket);
    }

    bucket.count += 1;
    bucket.sumR += r;
    bucket.sumG += g;
    bucket.sumB += b;
    bucket.samples.push([r, g, b]);
    sampleCount += 1;
  };

  for (let x = 0; x < width; x += 1) {
    addSample(x, 0);
    addSample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    addSample(0, y);
    addSample(width - 1, y);
  }

  if (!sampleCount) {
    return null;
  }

  const dominant = Array.from(bins.values()).sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count / sampleCount < MIN_BACKGROUND_DOMINANCE_RATIO) {
    return null;
  }

  const backgroundR = dominant.sumR / dominant.count;
  const backgroundG = dominant.sumG / dominant.count;
  const backgroundB = dominant.sumB / dominant.count;

  let totalDistance = 0;
  let maxDistance = 0;
  for (const [r, g, b] of dominant.samples) {
    const distance = colorDistance(r, g, b, backgroundR, backgroundG, backgroundB);
    totalDistance += distance;
    if (distance > maxDistance) {
      maxDistance = distance;
    }
  }

  const averageDistance = totalDistance / dominant.count;
  if (maxDistance > MAX_BACKGROUND_SAMPLE_DISTANCE) {
    return null;
  }

  return {
    r: backgroundR,
    g: backgroundG,
    b: backgroundB,
    distanceThreshold: Math.max(
      MIN_BACKGROUND_DISTANCE_THRESHOLD,
      Math.min(MAX_BACKGROUND_DISTANCE_THRESHOLD, averageDistance * 2.6 + 12)
    )
  };
}

function getEdgeSampleIndexes(width, height) {
  const indexes = [];
  const add = (x, y) => indexes.push(y * width + x);

  for (let x = 0; x < width; x += 1) {
    add(x, 0);
    if (height > 1) add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(0, y);
    if (width > 1) add(width - 1, y);
  }

  return indexes;
}

function detectSoftBackgroundColor(imageData) {
  const { data, width, height } = imageData;
  if (!width || !height) return null;

  const edgeIndexes = getEdgeSampleIndexes(width, height);
  const samples = [];
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (const index of edgeIndexes) {
    const offset = index * 4;
    if (data[offset + 3] < 250) continue;

    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const chroma = maxChannel - minChannel;
    if (minChannel < SOFT_BACKGROUND_MIN_CHANNEL || chroma > SOFT_BACKGROUND_MAX_CHROMA) {
      continue;
    }

    samples.push([r, g, b]);
    sumR += r;
    sumG += g;
    sumB += b;
  }

  if (samples.length / Math.max(1, edgeIndexes.length) < MIN_SOFT_BACKGROUND_EDGE_RATIO) {
    return null;
  }

  const backgroundR = sumR / samples.length;
  const backgroundG = sumG / samples.length;
  const backgroundB = sumB / samples.length;

  let totalDistance = 0;
  for (const [r, g, b] of samples) {
    totalDistance += colorDistance(r, g, b, backgroundR, backgroundG, backgroundB);
  }

  const averageDistance = totalDistance / samples.length;
  return {
    r: backgroundR,
    g: backgroundG,
    b: backgroundB,
    distanceThreshold: Math.max(
      MIN_BACKGROUND_DISTANCE_THRESHOLD,
      Math.min(MAX_SOFT_BACKGROUND_DISTANCE_THRESHOLD, averageDistance * 2.2 + BACKGROUND_DISTANCE_THRESHOLD_PAD)
    )
  };
}

function isBackgroundLikePixel(data, index, background) {
  const offset = index * 4;
  if (data[offset + 3] < 250) return true;

  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const chroma = maxChannel - minChannel;
  if (maxChannel < 15) return true;

  const backgroundDistance = colorDistance(r, g, b, background.r, background.g, background.b);
  if (backgroundDistance <= background.distanceThreshold) return true;

  return minChannel >= 235 && chroma <= 36;
}

function deriveConnectedForegroundMask(imageData, background) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  const backgroundMask = new Uint8Array(pixelCount);
  const stack = [];

  const addBackgroundSeed = index => {
    if (backgroundMask[index] || !isBackgroundLikePixel(data, index, background)) return;
    backgroundMask[index] = 1;
    stack.push(index);
  };

  for (const index of getEdgeSampleIndexes(width, height)) {
    addBackgroundSeed(index);
  }

  while (stack.length) {
    const current = stack.pop();
    const x = current % width;
    const y = Math.floor(current / width);

    if (x > 0) addBackgroundSeed(current - 1);
    if (x + 1 < width) addBackgroundSeed(current + 1);
    if (y > 0) addBackgroundSeed(current - width);
    if (y + 1 < height) addBackgroundSeed(current + width);
  }

  const foreground = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    const maxChannel = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    foreground[i] = !backgroundMask[i] && maxChannel >= 15 ? 255 : 0;
  }
  return foreground;
}

function deriveAlphaMask(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  const rawAlpha = new Uint8Array(pixelCount);
  let transparentPixels = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const alpha = data[i * 4 + 3];
    rawAlpha[i] = alpha;
    if (alpha < 250) transparentPixels += 1;
  }

  if (transparentPixels > pixelCount * 0.002) {
    return rawAlpha;
  }

  const background = detectSolidBackgroundColor(imageData) ?? detectSoftBackgroundColor(imageData);
  if (background) {
    return deriveConnectedForegroundMask(imageData, background);
  }

  const derived = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const distanceFromWhite = 255 - minChannel;
    const chroma = maxChannel - minChannel;
    const isVeryDark = maxChannel < 15;
    const isForeground = !isVeryDark && (distanceFromWhite > 18 || (distanceFromWhite > 8 && chroma > 16));
    derived[i] = isForeground ? 255 : 0;
  }
  return derived;
}

function collectComponents(alpha, width, height, options = {}) {
  const visited = new Uint8Array(width * height);
  const components = [];
  const minHeight = Math.max(1, options.minHeight ?? Math.floor(height * MIN_COMPONENT_HEIGHT_RATIO));
  const minPixels = Math.max(1, options.minPixels ?? MIN_COMPONENT_PIXELS);
  const minWidth = Math.max(1, options.minWidth ?? 18);

  for (let index = 0; index < alpha.length; index += 1) {
    if (!alpha[index] || visited[index]) continue;

    const stack = [index];
    const pixels = [];
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    visited[index] = 1;

    while (stack.length) {
      const current = stack.pop();
      pixels.push(current);
      const x = current % width;
      const y = Math.floor(current / width);

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0) {
        const next = current - 1;
        if (alpha[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
      if (x + 1 < width) {
        const next = current + 1;
        if (alpha[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
      if (y > 0) {
        const next = current - width;
        if (alpha[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
      if (y + 1 < height) {
        const next = current + width;
        if (alpha[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    if (pixels.length >= minPixels && componentHeight >= minHeight && componentWidth >= minWidth) {
      components.push({ pixels, minX, minY, maxX, maxY });
    }
  }

  return components;
}

function mergeNearbyComponents(components) {
  if (components.length <= 1) return components.slice();

  const sorted = components.slice().sort((a, b) => (a.minX - b.minX) || (a.minY - b.minY));
  const merged = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    const horizontalGap = next.minX - current.maxX;
    const verticalOverlap = Math.min(current.maxY, next.maxY) - Math.max(current.minY, next.minY);
    if (horizontalGap <= COMPONENT_JOIN_GAP && verticalOverlap > 0) {
      current = {
        pixels: current.pixels.concat(next.pixels),
        minX: Math.min(current.minX, next.minX),
        minY: Math.min(current.minY, next.minY),
        maxX: Math.max(current.maxX, next.maxX),
        maxY: Math.max(current.maxY, next.maxY)
      };
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);
  return merged;
}

function pickPrimaryComponent(alpha, width, height) {
  const merged = mergeNearbyComponents(collectComponents(alpha, width, height));
  if (!merged.length) return null;
  return merged.sort((a, b) => b.pixels.length - a.pixels.length)[0];
}

function scoreCleanupComponent(component) {
  const width = component.maxX - component.minX + 1;
  const height = component.maxY - component.minY + 1;
  const aspect = height / Math.max(1, width);
  const verticalBias = 1 + Math.max(0, (height - width) / Math.max(1, height));
  return component.pixels.length * Math.max(0.12, aspect) * verticalBias;
}

function retainBestScaledComponent(alpha, width, height) {
  const components = collectComponents(alpha, width, height, {
    minPixels: CLEANUP_MIN_COMPONENT_PIXELS,
    minHeight: 1,
    minWidth: 1
  });
  if (components.length <= 1) return alpha;

  const keeper = components.slice().sort((a, b) => scoreCleanupComponent(b) - scoreCleanupComponent(a))[0];
  const cleaned = new Uint8Array(width * height);
  for (const pixelIndex of keeper.pixels) {
    cleaned[pixelIndex] = alpha[pixelIndex];
  }
  return cleaned;
}

function applyAlphaMaskToCanvas(canvas, alpha, width, height) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, width, height);
  for (let i = 0; i < alpha.length; i += 1) {
    imageData.data[i * 4 + 3] = alpha[i];
  }
  context.putImageData(imageData, 0, 0);
}

function featherCanvasAlpha(canvas, width, height) {
  const ctx = canvas.getContext("2d");
  const temp = document.createElement("canvas");
  temp.width = width;
  temp.height = height;
  const tempCtx = temp.getContext("2d");
  tempCtx.filter = `blur(${ALPHA_FEATHER_PX}px)`;
  tempCtx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(temp, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

function buildMaskedFrame(sourceImageData, sourceWidth, sourceHeight, component) {
  const trimmedWidth = component.maxX - component.minX + 1;
  const trimmedHeight = component.maxY - component.minY + 1;
  if (trimmedWidth <= 0 || trimmedHeight <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = trimmedWidth;
  canvas.height = trimmedHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const output = context.createImageData(trimmedWidth, trimmedHeight);

  for (const pixelIndex of component.pixels) {
    const sourceX = pixelIndex % sourceWidth;
    const sourceY = Math.floor(pixelIndex / sourceWidth);
    const sourceOffset = pixelIndex * 4;
    const targetOffset = ((sourceY - component.minY) * trimmedWidth + (sourceX - component.minX)) * 4;
    output.data[targetOffset] = sourceImageData[sourceOffset];
    output.data[targetOffset + 1] = sourceImageData[sourceOffset + 1];
    output.data[targetOffset + 2] = sourceImageData[sourceOffset + 2];
    output.data[targetOffset + 3] = 255;
  }

  context.putImageData(output, 0, 0);
  return canvas;
}

function scaleCanvas(canvas, width, height) {
  const scaled = document.createElement("canvas");
  scaled.width = width;
  scaled.height = height;
  const context = scaled.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.drawImage(canvas, 0, 0, width, height);
  return scaled;
}

function makeNormalizedMask(alpha, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = NORMALIZED_COMPARE_WIDTH;
  canvas.height = NORMALIZED_COMPARE_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const target = context.createImageData(NORMALIZED_COMPARE_WIDTH, NORMALIZED_COMPARE_HEIGHT);

  const scale = Math.min(
    NORMALIZED_COMPARE_WIDTH / Math.max(1, width),
    NORMALIZED_COMPARE_HEIGHT / Math.max(1, height)
  );
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));
  const offsetX = Math.floor((NORMALIZED_COMPARE_WIDTH - drawWidth) / 2);
  const offsetY = NORMALIZED_COMPARE_HEIGHT - drawHeight;

  for (let y = 0; y < drawHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor((y / drawHeight) * height));
    for (let x = 0; x < drawWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor((x / drawWidth) * width));
      const alphaValue = alpha[sourceY * width + sourceX];
      if (alphaValue <= 10) continue;
      const targetOffset = ((offsetY + y) * NORMALIZED_COMPARE_WIDTH + offsetX + x) * 4;
      target.data[targetOffset] = 255;
      target.data[targetOffset + 1] = 255;
      target.data[targetOffset + 2] = 255;
      target.data[targetOffset + 3] = 255;
    }
  }

  context.putImageData(target, 0, 0);
  const data = context.getImageData(0, 0, NORMALIZED_COMPARE_WIDTH, NORMALIZED_COMPARE_HEIGHT).data;
  const mask = new Uint8Array(NORMALIZED_COMPARE_WIDTH * NORMALIZED_COMPARE_HEIGHT);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = data[i * 4 + 3] > 10 ? 1 : 0;
  }
  return mask;
}

function maskDifferenceRatio(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let changed = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) changed += 1;
  }
  return changed / a.length;
}

async function buildFrameFromCurrentVideo(video, frameNumber, timestamp, options) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(video, 0, 0, sourceWidth, sourceHeight);

  const sourceImageData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
  const rawAlpha = deriveAlphaMask(sourceImageData);
  const component = pickPrimaryComponent(rawAlpha, sourceWidth, sourceHeight);
  if (!component) return null;

  const maskedCanvas = buildMaskedFrame(sourceImageData.data, sourceWidth, sourceHeight, component);
  if (!maskedCanvas) return null;

  const scale = options.targetHeight / Math.max(1, maskedCanvas.height);
  const scaledWidth = Math.max(1, Math.round(maskedCanvas.width * scale));
  const scaledHeight = Math.max(1, Math.round(maskedCanvas.height * scale));
  const paintedCanvas = scaleCanvas(maskedCanvas, scaledWidth, scaledHeight);

  const paintedContext = paintedCanvas.getContext("2d", { willReadFrequently: true });
  const scaledImageData = paintedContext.getImageData(0, 0, scaledWidth, scaledHeight);
  const rawScaledAlpha = new Uint8Array(scaledWidth * scaledHeight);
  for (let i = 0; i < rawScaledAlpha.length; i += 1) {
    rawScaledAlpha[i] = scaledImageData.data[i * 4 + 3];
  }

  const scaledAlpha = retainBestScaledComponent(rawScaledAlpha, scaledWidth, scaledHeight);
  applyAlphaMaskToCanvas(paintedCanvas, scaledAlpha, scaledWidth, scaledHeight);
  featherCanvasAlpha(paintedCanvas, scaledWidth, scaledHeight);

  const formAssembly = exclusion.fromAlphaChannel(scaledAlpha, scaledWidth, scaledHeight, {
    x: 0,
    y: 0,
    bandHeight: options.bandHeight,
    tiers: options.tiers,
    gap: options.gap
  });

  return {
    id: `frame-${frameNumber + 1}`,
    label: `${timestamp.toFixed(2)}s`,
    timestamp,
    width: scaledWidth,
    height: scaledHeight,
    imageUrl: paintedCanvas.toDataURL("image/png"),
    formPreviewUrl: formAssembly.preview({ scale: 1 }).toDataURL("image/png"),
    formAssemblyJson: formAssembly.toJSON(),
    normalizedMask: makeNormalizedMask(scaledAlpha, scaledWidth, scaledHeight)
  };
}

import { exclusion } from "@layoutmaster/layoutmaster";

/**
 * Sample an image's alpha channel into a Layoutmaster exclusion assembly.
 *
 * Use this when an app has a PNG, canvas, ImageBitmap, or image URL and wants
 * text to flow around that visual silhouette. The browser-only work happens
 * here: decode/draw the image, read alpha pixels, then hand the alpha mask to
 * core Layoutmaster as a normal `exclusion.fromAlphaChannel(...)` assembly.
 *
 * Example:
 *
 * ```js
 * import { form, exclusion } from "@layoutmaster/layoutmaster";
 * import { imageToExclusion } from "./helpers/image-to-exclusion.js";
 *
 * const shape = await imageToExclusion("/mask.png", {
 *   x: 40,
 *   y: 20,
 *   width: 180,
 *   height: 220,
 *   bandHeight: 4,
 *   tiers: 3,
 *   gap: 8
 * });
 *
 * const result = form(text, {
 *   width: 520,
 *   exclusions: [shape]
 * });
 *
 * const saved = shape.toJSON();
 * const replayed = exclusion.fromJSON(saved, { x: 40, y: 20 });
 * ```
 */
export async function imageToExclusion(source, options = {}) {
  let drawable;
  if (typeof source === "string") {
    const response = await fetch(source);
    const blob = await response.blob();
    drawable = await createImageBitmap(blob);
  } else {
    drawable = source;
  }

  const naturalWidth = drawable.naturalWidth ?? drawable.width ?? 0;
  const naturalHeight = drawable.naturalHeight ?? drawable.height ?? 0;
  const width = Math.max(1, Math.round(normalizeFiniteNumber(options.width, naturalWidth)));
  const height = Math.max(1, Math.round(normalizeFiniteNumber(options.height, naturalHeight)));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(drawable, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);

  if (typeof source === "string" && typeof drawable.close === "function") {
    drawable.close();
  }

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = imageData.data[i * 4 + 3];
  }

  return exclusion.fromAlphaChannel(alpha, width, height, options);
}

function normalizeFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

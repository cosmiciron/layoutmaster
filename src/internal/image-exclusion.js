const ASSEMBLY_TIER_PRESETS = {
  1: [{ threshold: 0.15, r: 1 }],
  2: [{ threshold: 0.5, r: 1 }, { threshold: 0.1, r: 0.4 }],
  3: [{ threshold: 0.7, r: 1 }, { threshold: 0.25, r: 0.6 }, { threshold: 0.05, r: 0.3 }],
  4: [{ threshold: 0.8, r: 1 }, { threshold: 0.5, r: 0.6 }, { threshold: 0.2, r: 0.3 }, { threshold: 0.05, r: 0.14 }]
};

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePositiveDimension(value, fieldName) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`[layoutmaster] ${fieldName} must be a positive number.`);
  }
  return numeric;
}

function scanAlphaBand(alpha, width, yBand, bandH, height) {
  const result = new Float32Array(width);
  const yEnd = Math.min(yBand + bandH, height);
  for (let x = 0; x < width; x++) {
    let max = 0;
    for (let y = yBand; y < yEnd; y++) {
      const a = alpha[y * width + x] / 255;
      if (a > max) max = a;
    }
    result[x] = max;
  }
  return result;
}

function findAlphaSpans(row, threshold, yBand, bandH) {
  const spans = [];
  let start = -1;
  for (let x = 0; x <= row.length; x++) {
    const above = x < row.length && row[x] >= threshold;
    if (above && start < 0) {
      start = x;
    } else if (!above && start >= 0) {
      spans.push({ x: start, y: yBand, w: x - start, h: bandH, r: 0 });
      start = -1;
    }
  }
  return spans;
}

function mergeAssemblyRectsVertical(rects) {
  const groups = new Map();
  for (const rect of rects) {
    const key = `${rect.x},${rect.w},${rect.r}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rect);
  }
  const merged = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.y - b.y);
    let cur = { ...group[0] };
    for (let i = 1; i < group.length; i++) {
      if (group[i].y === cur.y + cur.h) {
        cur.h += group[i].h;
      } else {
        merged.push(cur);
        cur = { ...group[i] };
      }
    }
    merged.push(cur);
  }
  return merged;
}

function buildAssemblyMembersFromAlpha(alpha, width, height, bandHeight, tierCount) {
  const tiers = ASSEMBLY_TIER_PRESETS[Math.min(4, Math.max(1, tierCount))];
  const raw = [];
  for (let yBand = 0; yBand < height; yBand += bandHeight) {
    const actualH = Math.min(bandHeight, height - yBand);
    const row = scanAlphaBand(alpha, width, yBand, actualH, height);
    for (const tier of tiers) {
      for (const span of findAlphaSpans(row, tier.threshold, yBand, actualH)) {
        raw.push({ ...span, r: tier.r });
      }
    }
  }
  return mergeAssemblyRectsVertical(raw).map((rect) => {
    const member = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, shape: "rect" };
    if (rect.r < 1) member.resistance = rect.r;
    return member;
  });
}

function assemblyMembersToCompactLayers(members, width, height) {
  const map = new Map();
  for (const member of members) {
    const r = member.resistance ?? 1;
    if (!map.has(r)) map.set(r, []);
    map.get(r).push([member.x, member.y, member.w, member.h]);
  }
  const layers = [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([r, rects]) => r === 1 ? { rects } : { r, rects });
  return { width, height, layers };
}

function membersFromCompactLayers(data) {
  const members = [];
  for (const layer of data.layers) {
    const r = normalizeFiniteNumber(layer.r, 1);
    for (const rect of layer.rects || []) {
      if (!Array.isArray(rect) || rect.length < 4) continue;
      const [x, y, w, h] = rect;
      const nw = normalizeFiniteNumber(w, 0);
      const nh = normalizeFiniteNumber(h, 0);
      if (nw <= 0 || nh <= 0) continue;
      const member = { x: normalizeFiniteNumber(x, 0), y: normalizeFiniteNumber(y, 0), w: nw, h: nh, shape: "rect" };
      if (r < 1) member.resistance = r;
      members.push(member);
    }
  }
  return members;
}

function renderAssemblyPreviewCanvas(members, width, height, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sorted = [...members].sort((a, b) => (a.resistance ?? 1) - (b.resistance ?? 1));
  for (const member of sorted) {
    const gray = Math.round(255 * (1 - (member.resistance ?? 1)));
    ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
    ctx.fillRect(
      Math.round(member.x * scale),
      Math.round(member.y * scale),
      Math.round(member.w * scale),
      Math.round(member.h * scale)
    );
  }
  return canvas;
}

function createAssemblyExclusionToken(x, y, width, height, members, gap) {
  const frozenMembers = Object.freeze(members.map((member) => Object.freeze({ ...member })));
  return Object.freeze({
    kind: "assembly",
    input: Object.freeze({ x, y, width, height, gap, members: frozenMembers }),
    x,
    y,
    width,
    height,
    parts: Object.freeze({ count: frozenMembers.length }),
    toJSON() {
      return assemblyMembersToCompactLayers(frozenMembers, width, height);
    },
    preview(options) {
      const scale = Math.max(1, normalizeFiniteNumber(options?.scale, 1));
      return renderAssemblyPreviewCanvas(frozenMembers, width, height, scale);
    }
  });
}

export function createExclusionFromAlphaChannel(alpha, width, height, options = {}) {
  if (!(alpha instanceof Uint8Array)) {
    throw new Error("[layoutmaster] exclusion.fromAlphaChannel: alpha must be a Uint8Array.");
  }
  const w = Math.round(normalizePositiveDimension(width, "width"));
  const h = Math.round(normalizePositiveDimension(height, "height"));
  if (alpha.length !== w * h) {
    throw new Error(`[layoutmaster] exclusion.fromAlphaChannel: alpha length (${alpha.length}) does not match width x height (${w * h}).`);
  }
  const x = normalizeFiniteNumber(options.x, 0);
  const y = normalizeFiniteNumber(options.y, 0);
  const gap = Math.max(0, normalizeFiniteNumber(options.gap, 0));
  const bandHeight = Math.max(1, Math.round(normalizeFiniteNumber(options.bandHeight, 6)));
  const tierCount = Math.min(4, Math.max(1, Math.round(normalizeFiniteNumber(options.tiers, 3))));
  const members = buildAssemblyMembersFromAlpha(alpha, w, h, bandHeight, tierCount);
  return createAssemblyExclusionToken(x, y, w, h, members, gap);
}

export function createExclusionFromJSON(data, options = {}) {
  if (!isPlainObject(data) || !Array.isArray(data.layers)) {
    throw new Error("[layoutmaster] exclusion.fromJSON: data must be a value returned by LayoutmasterExclusionAssembly.toJSON().");
  }
  const width = normalizePositiveDimension(data.width, "width");
  const height = normalizePositiveDimension(data.height, "height");
  const x = normalizeFiniteNumber(options.x, 0);
  const y = normalizeFiniteNumber(options.y, 0);
  const gap = Math.max(0, normalizeFiniteNumber(options.gap, 0));
  const members = membersFromCompactLayers(data);
  return createAssemblyExclusionToken(x, y, width, height, members, gap);
}

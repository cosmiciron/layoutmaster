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

function normalizeAssemblyDimension(value, fallback, fieldName) {
  if (value === undefined || value === null) {
    return Math.max(1, fallback);
  }
  return normalizePositiveDimension(value, fieldName);
}

function getPointBounds(points) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function normalizePolygonPoints(points, offsetX = 0, offsetY = 0) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("[layoutmaster] exclusion.assembly polygon parts require at least three points.");
  }
  return points.map((point, index) => {
    const source = Array.isArray(point)
      ? { x: point[0], y: point[1] }
      : point;
    if (!isPlainObject(source)) {
      throw new Error(`[layoutmaster] exclusion.assembly polygon point at index ${index} must be [x, y] or { x, y }.`);
    }
    const x = Number(source.x);
    const y = Number(source.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`[layoutmaster] exclusion.assembly polygon point at index ${index} must contain finite x and y values.`);
    }
    return { x: x + offsetX, y: y + offsetY };
  });
}

function buildPolygonPath(points, offsetX, offsetY) {
  const commands = points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${point.x - offsetX} ${point.y - offsetY}`
  );
  commands.push("Z");
  return commands.join(" ");
}

function buildCapsulePoints(x1, y1, x2, y2, thickness) {
  const radius = thickness / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const segments = 6;
  if (length <= 0.0001) {
    return Array.from({ length: segments * 2 }, (_, index) => {
      const angle = (index / (segments * 2)) * Math.PI * 2;
      return [
        x1 + Math.cos(angle) * radius,
        y1 + Math.sin(angle) * radius
      ];
    });
  }

  const angle = Math.atan2(dy, dx);
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const a = angle - Math.PI / 2 + (i / segments) * Math.PI;
    points.push([x2 + Math.cos(a) * radius, y2 + Math.sin(a) * radius]);
  }
  for (let i = 0; i <= segments; i++) {
    const a = angle + Math.PI / 2 + (i / segments) * Math.PI;
    points.push([x1 + Math.cos(a) * radius, y1 + Math.sin(a) * radius]);
  }
  return points;
}

function resolveSegmentEndpoints(part, index) {
  if (
    part.x1 !== undefined
    || part.y1 !== undefined
    || part.x2 !== undefined
    || part.y2 !== undefined
  ) {
    const x1 = Number(part.x1);
    const y1 = Number(part.y1);
    const x2 = Number(part.x2);
    const y2 = Number(part.y2);
    if (![x1, y1, x2, y2].every(Number.isFinite)) {
      throw new Error(`[layoutmaster] exclusion.assembly parts[${index}] line endpoints must be finite x1, y1, x2, and y2 values.`);
    }
    return { x1, y1, x2, y2 };
  }

  const x = Number(part.x);
  const y = Number(part.y);
  const length = Number(part.length);
  const angle = Number(part.angle ?? part.degrees ?? 0);
  if (![x, y, length, angle].every(Number.isFinite) || length <= 0) {
    throw new Error(`[layoutmaster] exclusion.assembly parts[${index}] line parts require either x1/y1/x2/y2 or x/y/length/angle.`);
  }
  const radians = angle * Math.PI / 180;
  return {
    x1: x,
    y1: y,
    x2: x + Math.cos(radians) * length,
    y2: y + Math.sin(radians) * length
  };
}

function polygonMemberFromPoints(points, resistance) {
  const normalizedPoints = normalizePolygonPoints(points);
  const bounds = getPointBounds(normalizedPoints);
  const member = {
    shape: "polygon",
    x: bounds.minX,
    y: bounds.minY,
    w: Math.max(1, bounds.maxX - bounds.minX),
    h: Math.max(1, bounds.maxY - bounds.minY),
    path: buildPolygonPath(normalizedPoints, bounds.minX, bounds.minY)
  };
  if (resistance !== undefined && resistance < 1) member.resistance = resistance;
  return member;
}

function normalizeResistance(value) {
  if (value === undefined || value === null) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("[layoutmaster] exclusion.assembly resistance must be a finite number when provided.");
  }
  return Math.max(0, Math.min(1, numeric));
}

function normalizeLowLevelMember(member, index) {
  if (!isPlainObject(member)) {
    throw new Error(`[layoutmaster] exclusion.assembly members[${index}] must be an object.`);
  }
  const shape = String(member.shape || member.kind || "rect");
  if (!["rect", "circle", "ellipse", "polygon"].includes(shape)) {
    throw new Error(`[layoutmaster] exclusion.assembly members[${index}].shape must be rect, circle, ellipse, or polygon.`);
  }
  const normalized = {
    shape,
    x: normalizeFiniteNumber(member.x, 0),
    y: normalizeFiniteNumber(member.y, 0),
    w: normalizePositiveDimension(member.w ?? member.width, `exclusion.assembly members[${index}].w`),
    h: normalizePositiveDimension(member.h ?? member.height, `exclusion.assembly members[${index}].h`)
  };
  if (shape === "polygon" && member.path !== undefined) {
    normalized.path = String(member.path);
  }
  const resistance = normalizeResistance(member.resistance ?? member.r);
  if (resistance !== undefined && resistance < 1) normalized.resistance = resistance;
  return normalized;
}

function normalizeAssemblyPart(part, index) {
  if (!isPlainObject(part)) {
    throw new Error(`[layoutmaster] exclusion.assembly parts[${index}] must be an object.`);
  }
  const kind = String(part.kind || part.shape || "rect");
  const x = normalizeFiniteNumber(part.x, 0);
  const y = normalizeFiniteNumber(part.y, 0);
  const resistance = normalizeResistance(part.resistance ?? part.r);
  const member = { shape: kind, x, y, w: 0, h: 0 };

  if (kind === "circle") {
    const diameter = part.radius !== undefined
      ? normalizePositiveDimension(part.radius, `exclusion.assembly parts[${index}].radius`) * 2
      : normalizePositiveDimension(part.width ?? part.w, `exclusion.assembly parts[${index}].width`);
    member.w = diameter;
    member.h = part.height ?? part.h
      ? normalizePositiveDimension(part.height ?? part.h, `exclusion.assembly parts[${index}].height`)
      : diameter;
  } else if (kind === "rect" || kind === "ellipse") {
    member.w = normalizePositiveDimension(part.width ?? part.w, `exclusion.assembly parts[${index}].width`);
    member.h = normalizePositiveDimension(part.height ?? part.h, `exclusion.assembly parts[${index}].height`);
  } else if (kind === "polygon") {
    return polygonMemberFromPoints(
      normalizePolygonPoints(part.points, x, y).map((point) => [point.x, point.y]),
      resistance
    );
  } else if (kind === "line" || kind === "capsule") {
    const { x1, y1, x2, y2 } = resolveSegmentEndpoints(part, index);
    const thickness = normalizePositiveDimension(
      part.thickness ?? part.strokeWidth ?? part.width ?? part.w ?? 1,
      `exclusion.assembly parts[${index}].thickness`
    );
    return polygonMemberFromPoints(
      buildCapsulePoints(x1, y1, x2, y2, thickness),
      resistance
    );
  } else {
    throw new Error(`[layoutmaster] exclusion.assembly parts[${index}].kind must be rect, circle, ellipse, polygon, line, or capsule.`);
  }

  if (resistance !== undefined && resistance < 1) member.resistance = resistance;
  return member;
}

function getMembersBounds(members) {
  let maxX = 0;
  let maxY = 0;
  for (const member of members) {
    maxX = Math.max(maxX, member.x + member.w);
    maxY = Math.max(maxY, member.y + member.h);
  }
  return { width: maxX, height: maxY };
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

function assemblyMembersToPortableData(members, width, height) {
  const canUseLayers = members.every((member) =>
    (member.shape || "rect") === "rect" && !member.path
  );
  if (canUseLayers) {
    return assemblyMembersToCompactLayers(members, width, height);
  }
  return {
    width,
    height,
    members: members.map((member) => ({
      shape: member.shape || "rect",
      x: member.x,
      y: member.y,
      w: member.w,
      h: member.h,
      ...(member.path ? { path: member.path } : {}),
      ...(member.resistance !== undefined ? { resistance: member.resistance } : {})
    }))
  };
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

function normalizeAssemblyMembers(data) {
  if (Array.isArray(data.parts)) {
    return data.parts.map((part, index) => normalizeAssemblyPart(part, index));
  }
  if (Array.isArray(data.members)) {
    return data.members.map((member, index) => normalizeLowLevelMember(member, index));
  }
  if (Array.isArray(data.layers)) {
    return membersFromCompactLayers(data);
  }
  throw new Error("[layoutmaster] exclusion.assembly requires parts, members, or layers.");
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
    ctx.save();
    ctx.translate(member.x * scale, member.y * scale);
    ctx.scale(scale, scale);
    if (member.shape === "circle" || member.shape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(member.w / 2, member.h / 2, member.w / 2, member.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (member.shape === "polygon" && member.path && typeof Path2D !== "undefined") {
      ctx.fill(new Path2D(member.path));
    } else {
      ctx.fillRect(0, 0, member.w, member.h);
    }
    ctx.restore();
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
      return assemblyMembersToPortableData(frozenMembers, width, height);
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
  if (!isPlainObject(data) || (!Array.isArray(data.layers) && !Array.isArray(data.members) && !Array.isArray(data.parts))) {
    throw new Error("[layoutmaster] exclusion.fromJSON: data must be a value returned by LayoutmasterExclusionAssembly.toJSON().");
  }
  const width = normalizePositiveDimension(data.width, "width");
  const height = normalizePositiveDimension(data.height, "height");
  const x = normalizeFiniteNumber(options.x, 0);
  const y = normalizeFiniteNumber(options.y, 0);
  const gap = Math.max(0, normalizeFiniteNumber(options.gap, 0));
  const members = normalizeAssemblyMembers(data);
  return createAssemblyExclusionToken(x, y, width, height, members, gap);
}

export function createExclusionFromAssembly(data = {}) {
  if (!isPlainObject(data)) {
    throw new Error("[layoutmaster] exclusion.assembly options must be an object.");
  }
  const members = normalizeAssemblyMembers(data);
  if (members.length === 0) {
    throw new Error("[layoutmaster] exclusion.assembly requires at least one part or member.");
  }
  const bounds = getMembersBounds(members);
  const x = normalizeFiniteNumber(data.x, 0);
  const y = normalizeFiniteNumber(data.y, 0);
  const gap = Math.max(0, normalizeFiniteNumber(data.gap, 0));
  const width = normalizeAssemblyDimension(data.width, bounds.width, "width");
  const height = normalizeAssemblyDimension(data.height, bounds.height, "height");
  return createAssemblyExclusionToken(x, y, width, height, members, gap);
}

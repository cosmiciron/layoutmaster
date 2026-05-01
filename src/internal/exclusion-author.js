import {
  createExclusionFromAssembly,
  createExclusionFromAlphaChannel,
  createExclusionFromJSON
} from "./image-exclusion.js";

const EXCLUSION_KINDS = new Set(["circle", "rect", "ellipse", "polygon", "assembly"]);

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

export function isLayoutmasterExclusion(value) {
  return isPlainObject(value)
    && EXCLUSION_KINDS.has(value.kind)
    && isPlainObject(value.input);
}

function createExclusionDescriptor(kind, input) {
  return Object.freeze({
    kind,
    input: Object.freeze({ ...input })
  });
}

export function normalizeExclusions(value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("[layoutmaster] exclusions must be an array when provided.");
  }
  return value.map((entry, index) => {
    if (!isLayoutmasterExclusion(entry)) {
      throw new Error(`[layoutmaster] exclusions[${index}] must be created by a layoutmaster exclusion utility.`);
    }
    return entry;
  });
}

function normalizePolygonPoints(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("[layoutmaster] polygon exclusions require at least three points.");
  }

  return points.map((point, index) => {
    if (Array.isArray(point)) {
      if (point.length < 2) {
        throw new Error(`[layoutmaster] polygon point at index ${index} must contain x and y values.`);
      }
      const px = Number(point[0]);
      const py = Number(point[1]);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        throw new Error(`[layoutmaster] polygon point at index ${index} must contain finite x and y values.`);
      }
      return { x: px, y: py };
    }

    if (isPlainObject(point)) {
      const px = Number(point.x);
      const py = Number(point.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        throw new Error(`[layoutmaster] polygon point at index ${index} must contain finite x and y values.`);
      }
      return { x: px, y: py };
    }

    throw new Error(`[layoutmaster] polygon point at index ${index} must be [x, y] or { x, y }.`);
  });
}

function getPolygonBounds(points) {
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

function buildPolygonPath(points, offsetX = 0, offsetY = 0) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("[layoutmaster] polygon exclusions require at least three points.");
  }
  const commands = points.map((point, index) => {
    const x = Number(point.x) - offsetX;
    const y = Number(point.y) - offsetY;
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  });
  commands.push("Z");
  return commands.join(" ");
}

export function lowerExclusionToField(entry) {
  const input = entry.input || {};
  const gap = Math.max(0, normalizeFiniteNumber(input.gap, 0));
  const x = normalizeFiniteNumber(input.x, 0);
  const y = normalizeFiniteNumber(input.y, 0);

  if (entry.kind === "circle") {
    const radius = normalizePositiveDimension(input.radius, "radius");
    const diameter = radius * 2;
    return {
      x,
      y,
      width: diameter,
      height: diameter,
      gap,
      shape: "circle"
    };
  }

  if (entry.kind === "ellipse") {
    return {
      x,
      y,
      width: normalizePositiveDimension(input.width, "width"),
      height: normalizePositiveDimension(input.height, "height"),
      gap,
      shape: "ellipse"
    };
  }

  if (entry.kind === "rect") {
    return {
      x,
      y,
      width: normalizePositiveDimension(input.width, "width"),
      height: normalizePositiveDimension(input.height, "height"),
      gap,
      shape: "rect"
    };
  }

  if (entry.kind === "polygon") {
    const normalized = normalizePolygonPoints(input.points);
    const bounds = getPolygonBounds(normalized);
    return {
      x: x + bounds.minX,
      y: y + bounds.minY,
      width: Math.max(1, bounds.maxX - bounds.minX),
      height: Math.max(1, bounds.maxY - bounds.minY),
      gap,
      shape: "polygon",
      path: buildPolygonPath(normalized, bounds.minX, bounds.minY)
    };
  }

  if (entry.kind === "assembly") {
    return {
      x,
      y,
      width: Math.max(0, normalizeFiniteNumber(input.width, 0)),
      height: Math.max(0, normalizeFiniteNumber(input.height, 0)),
      gap,
      shape: "rect",
      exclusionAssembly: { members: input.members }
    };
  }

  throw new Error(`[layoutmaster] Unsupported exclusion kind "${entry.kind}".`);
}

export function prependExclusionActors(exclusions, paragraphElements) {
  if (!Array.isArray(exclusions) || exclusions.length === 0) {
    return paragraphElements;
  }

  const fieldActors = exclusions.map((entry, index) =>
    buildExclusionFieldActor(entry, index)
  );

  return [...fieldActors, ...paragraphElements];
}

export function buildWorldPlainLayoutForExclusions(exclusions) {
  if (!Array.isArray(exclusions) || exclusions.length === 0) {
    return {};
  }
  return {
    worldPlain: {
      frameOverflow: "continue",
      worldBehavior: "expandable",
      rootFlowMode: "wrapped",
      traversalInteractionDefault: "auto"
    }
  };
}

function buildExclusionFieldActor(entry, index) {
  const field = lowerExclusionToField(entry);
  return {
    type: "field-actor",
    content: "",
    properties: {
      sourceId: `layoutmaster:exclusion:${index}`,
      style: {
        width: field.width,
        height: field.height
      },
      space: {
        kind: "exclude",
        x: field.x,
        y: field.y,
        wrap: "around",
        gap: field.gap,
        shape: field.shape,
        path: field.path,
        align: "center",
        exclusionAssembly: field.exclusionAssembly,
        hidden: true
      }
    }
  };
}

function createCircleExclusion(options = {}) {
  return createExclusionDescriptor("circle", options);
}

function createRectExclusion(options = {}) {
  return createExclusionDescriptor("rect", options);
}

function createEllipseExclusion(options = {}) {
  return createExclusionDescriptor("ellipse", options);
}

function createPolygonExclusion(options = {}) {
  return createExclusionDescriptor("polygon", options);
}

export const exclusion = Object.freeze({
  circle: createCircleExclusion,
  rect: createRectExclusion,
  ellipse: createEllipseExclusion,
  polygon: createPolygonExclusion,
  assembly: createExclusionFromAssembly,
  fromAlphaChannel: createExclusionFromAlphaChannel,
  fromJSON: createExclusionFromJSON
});

import {
  computeFlowSnapshotSync,
  computePourSnapshotSync,
  computeSnapshotSync,
  createFitResult,
  createFormResult,
  invokeResultHandler,
} from "./runtime-core.js";
import {
  isLayoutmasterExclusion,
  lowerExclusionToField
} from "./exclusion-author.js";
import {
  isStructuredContentString,
  normalizeInputText,
  normalizeRequest,
  resolveCallArguments,
  resolveTargetOptions
} from "./request-options.js";

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const PLANNED_RESULT_CACHE_LIMIT = 128;

function stableCacheKey(value) {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableCacheKey).join(",")}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .filter((key) => typeof value[key] !== "undefined")
    .map((key) => `${JSON.stringify(key)}:${stableCacheKey(value[key])}`);
  return `{${entries.join(",")}}`;
}

function freezePlannedResult(result, seen = new WeakSet()) {
  if (result == null || typeof result !== "object" || seen.has(result)) {
    return result;
  }
  seen.add(result);
  for (const value of Object.values(result)) {
    freezePlannedResult(value, seen);
  }
  return Object.freeze(result);
}

function resolvePlanOptions(options) {
  if (options == null) return {};
  if (!isPlainObject(options)) {
    throw new Error("[layoutmaster] plan() options must be a plain object when provided.");
  }
  return { ...options };
}

function resolvePlannedCallArguments(baseOptions, optionsOrHandler, maybeHandler) {
  const handler = typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler;
  const callOptions = typeof optionsOrHandler === "function" ? {} : (optionsOrHandler || {});
  if (callOptions != null && !isPlainObject(callOptions)) {
    throw new Error("[layoutmaster] planned layout options must be a plain object when provided.");
  }
  return {
    options: {
      ...baseOptions,
      ...callOptions
    },
    handler
  };
}

function createPlannedContent(content, baseOptions) {
  const cache = new Map();

  const readCachedResult = (key) => {
    if (!cache.has(key)) return undefined;
    const cached = cache.get(key);
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  };

  const writeCachedResult = (key, result) => {
    cache.set(key, result);
    while (cache.size > PLANNED_RESULT_CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
  };

  const getCachedResult = (mode, options, factory) => {
    const key = `${mode}:${stableCacheKey(options)}`;
    const cached = readCachedResult(key);
    if (cached) return cached;
    const result = factory();
    const frozenResult = freezePlannedResult(result);
    writeCachedResult(key, frozenResult);
    return frozenResult;
  };

  return {
    form(optionsOrHandler, maybeHandler) {
      const { options, handler } = resolvePlannedCallArguments(baseOptions, optionsOrHandler, maybeHandler);
      const result = getCachedResult("form", options, () => form(content, options));
      invokeResultHandler(result, handler);
      return result;
    },
    fit(optionsOrHandler, maybeHandler) {
      const { options, handler } = resolvePlannedCallArguments(baseOptions, optionsOrHandler, maybeHandler);
      const result = getCachedResult("fit", options, () => fit(content, options));
      invokeResultHandler(result, handler);
      return result;
    },
    flow(targetsOrHandler, maybeHandler) {
      const handler = typeof targetsOrHandler === "function" ? targetsOrHandler : maybeHandler;
      const rawTargets = typeof targetsOrHandler === "function" ? [] : targetsOrHandler;
      if (!Array.isArray(rawTargets)) {
        throw new Error("[layoutmaster] planned flow() expects an array of bounded targets.");
      }
      const targets = rawTargets.map((target) => ({ ...baseOptions, ...target }));
      const result = getCachedResult("flow", targets, () => flow(content, targets));
      invokeResultHandler(result, handler);
      return result;
    },
    clear() {
      cache.clear();
    },
    get size() {
      return cache.size;
    }
  };
}

function createPlannedCollection(contents, baseOptions) {
  const items = contents.map((content, index) => {
    if (typeof content !== "string") {
      throw new Error(`[layoutmaster] plan() collection item at index ${index} must be a string.`);
    }
    return createPlannedContent(content, baseOptions);
  });

  return {
    items,
    formAll(optionsOrHandler, maybeHandler) {
      const { handler, options } = resolvePlannedCallArguments(baseOptions, optionsOrHandler, maybeHandler);
      const results = items.map((item) => item.form(options));
      invokeResultHandler(results, handler);
      return results;
    },
    fitAll(optionsOrHandler, maybeHandler) {
      const { handler, options } = resolvePlannedCallArguments(baseOptions, optionsOrHandler, maybeHandler);
      const results = items.map((item) => item.fit(options));
      invokeResultHandler(results, handler);
      return results;
    },
    clear() {
      for (const item of items) item.clear();
    },
    get size() {
      return items.reduce((total, item) => total + item.size, 0);
    }
  };
}

export function plan(content = "", options = {}) {
  const baseOptions = resolvePlanOptions(options);
  if (Array.isArray(content)) {
    return createPlannedCollection(content, baseOptions);
  }
  if (typeof content !== "string") {
    throw new Error("[layoutmaster] plan() content must be a string or an array of strings.");
  }
  return createPlannedContent(content, baseOptions);
}

export function form(content = "", optionsOrHandler, maybeHandler) {
  const { request, handler } = resolveCallArguments(content, optionsOrHandler, maybeHandler, "form");
  const result = createFormResult(computeSnapshotSync("form", request));
  invokeResultHandler(result, handler);
  return result;
}

export function fit(content = "", optionsOrHandler, maybeHandler) {
  const { request, handler } = resolveCallArguments(content, optionsOrHandler, maybeHandler, "fit");
  const result = createFitResult(computeSnapshotSync("fit", request));
  invokeResultHandler(result, handler);
  return result;
}

export function flow(content = "", targetsOrHandler, maybeHandler) {
  const handler = typeof targetsOrHandler === "function" ? targetsOrHandler : maybeHandler;
  const rawTargets = typeof targetsOrHandler === "function" ? [] : targetsOrHandler;
  if (!Array.isArray(rawTargets)) {
    throw new Error("[layoutmaster] flow() expects an array of bounded targets.");
  }

  const targetOptions = rawTargets.map((target, index) => {
    try {
      return resolveTargetOptions(target, "fit");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[layoutmaster] Invalid flow target at index ${index}: ${message}`);
    }
  });
  const targets = targetOptions.map((options, index) => {
    try {
      return normalizeRequest("", options, "fit");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[layoutmaster] Invalid flow target at index ${index}: ${message}`);
    }
  });

  if (typeof content !== "string") {
    throw new Error("[layoutmaster] content must be a string. Pass structured text as JSON content.");
  }

  if (targets.length === 0) {
    const remainingSourceText = isStructuredContentString(content) ? "" : normalizeInputText(content);
    const result = {
      placements: [],
      content: {
        consumed: { text: "", length: 0 },
        remaining: { text: remainingSourceText, length: remainingSourceText.length },
        complete: remainingSourceText.length === 0,
        hyphenated: false,
        sourceLength: remainingSourceText.length
      },
      performance: {
        layoutMs: 0,
        materializeMs: 0,
        resolveLinesMs: 0,
        buildTokensMs: 0,
        wrapStreamMs: 0,
        bidiMs: 0,
        scriptSplitMs: 0,
        wordSegmentMs: 0,
        actorMeasurementMs: 0,
        actorPlacementMs: 0,
        actorOverflowMs: 0,
        textMeasurementCacheHits: 0,
        textMeasurementCacheMisses: 0,
        colliderFieldQueryCalls: 0,
        colliderFieldNarrowphaseCalls: 0
      }
    };
    invokeResultHandler(result, handler);
    return result;
  }

  const sourceRequest = normalizeRequest(content, targetOptions[0], "fit");
  const result = computeFlowSnapshotSync(sourceRequest, targets);
  invokeResultHandler(result, handler);
  return result;
}

export function pour(content = "", shape, optionsOrHandler, maybeHandler) {
  const handler = typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler;
  const rawOptions = typeof optionsOrHandler === "function" ? {} : (optionsOrHandler || {});
  const options = resolveTargetOptions(rawOptions, "fit");

  if (!isLayoutmasterExclusion(shape)) {
    throw new Error("[layoutmaster] pour() requires a valid exclusion shape as the second argument.");
  }

  const field = lowerExclusionToField(shape);
  const request = normalizeRequest(content, {
    ...options,
    width: field.x + field.width,
    height: field.y + field.height
  }, "fit");

  const result = createFitResult(computePourSnapshotSync(field, request));
  invokeResultHandler(result, handler);
  return result;
}

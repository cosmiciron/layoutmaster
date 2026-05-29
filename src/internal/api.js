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

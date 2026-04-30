import {
  computeProduceSnapshotSync,
  computePourSnapshotSync,
  computeSnapshotSync,
  createDocumentFromProduceElements,
  createEmptyPerformance,
  createFitResult,
  createFormResult,
  invokeResultHandler,
  sumPerformance
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

function parseProduceSource(source) {
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) {
      throw new Error("[layoutmaster] produce() expects a full document JSON string or structured elements JSON.");
    }
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[layoutmaster] produce() could not parse JSON input: ${message}`);
    }
  }
  if (Array.isArray(source) || isPlainObject(source)) {
    return source;
  }
  throw new Error("[layoutmaster] produce() expects a full document object, elements object, elements array, or JSON string.");
}

function isFullDocumentSource(source) {
  return isPlainObject(source) && Array.isArray(source.elements) && isPlainObject(source.layout);
}

function isElementsSource(source) {
  return Array.isArray(source) || (isPlainObject(source) && Array.isArray(source.elements));
}

function resolveProduceOptions(optionsOrHandler, maybeHandler) {
  const handler = typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler;
  const options = typeof optionsOrHandler === "function" ? {} : (optionsOrHandler || {});
  if (options != null && !isPlainObject(options)) {
    throw new Error("[layoutmaster] produce() options must be a plain object when provided.");
  }
  return { options, handler };
}

function normalizeFullDocumentSource(source) {
  return {
    documentVersion: "1.1",
    ...source
  };
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

  const sourceIsStructured = isStructuredContentString(content);
  let remainingSourceText = sourceIsStructured ? "" : normalizeInputText(content);
  let useOriginalStructuredSource = sourceIsStructured;
  let consumedSourceText = "";
  let consumedSourceLength = 0;
  let lastHyphenated = false;
  let performance = createEmptyPerformance();

  const placements = targets.map((target, index) => {
    if (!useOriginalStructuredSource && remainingSourceText.length === 0) {
      return {
        index,
        pieces: [],
        lines: [],
        height: 0,
        content: {
          consumed: { text: "", length: 0 },
          remaining: { text: "", length: 0 },
          complete: true,
          hyphenated: false,
          sourceLength: 0
        }
      };
    }

    const request = useOriginalStructuredSource
      ? normalizeRequest(content, targetOptions[index], "fit")
      : {
        ...target,
        format: "plain",
        content: remainingSourceText,
        rawContent: remainingSourceText
      };
    useOriginalStructuredSource = false;
    const snapshot = computeSnapshotSync("fit", request);
    const result = createFitResult(snapshot);
    const contentReport = result.content;
    performance = sumPerformance(performance, result.performance);
    consumedSourceText += contentReport.consumed.text;
    consumedSourceLength += contentReport.consumed.length;
    remainingSourceText = contentReport.remaining.text;
    lastHyphenated = contentReport.hyphenated;

    return {
      index,
      pieces: result.pieces,
      lines: result.lines || [],
      height: result.height,
      content: contentReport
    };
  });

  const result = {
    placements,
    content: {
      consumed: { text: consumedSourceText, length: consumedSourceLength },
      remaining: { text: remainingSourceText, length: remainingSourceText.length },
      complete: remainingSourceText.length === 0,
      hyphenated: lastHyphenated,
      sourceLength: consumedSourceLength + remainingSourceText.length
    },
    performance
  };
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

export function produce(source, optionsOrHandler, maybeHandler) {
  const { options, handler } = resolveProduceOptions(optionsOrHandler, maybeHandler);
  const parsedSource = parseProduceSource(source);
  const documentInput = isFullDocumentSource(parsedSource)
    ? normalizeFullDocumentSource(parsedSource)
    : isElementsSource(parsedSource)
      ? createDocumentFromProduceElements(parsedSource, options)
      : null;

  if (!documentInput) {
    throw new Error("[layoutmaster] produce() expects a document with layout/elements or a structured elements payload.");
  }

  const result = computeProduceSnapshotSync(documentInput);
  invokeResultHandler(result, handler);
  return result;
}

import {
  buildFragmentModel,
  buildFragmentSourceId,
  normalizeInputText,
  parseCssPxValue
} from "./input-style.js";
import {
  computePageOccupiedHeight,
  extractRegionResults
} from "./engine-result-projection.js";
import {
  buildWorldPlainLayoutForExclusions,
  prependExclusionActors
} from "./exclusion-author.js";
import {
  normalizeRequest,
  OPEN_HEIGHT
} from "./request-options.js";
import { createEmbeddedEngineRunner } from "./engine-runner.js";

export function invokeResultHandler(result, handler) {
  if (typeof handler === "function") {
    handler(result);
  }
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function createResult({ pieces, lines, occupiedHeight, content }) {
  const result = {
    pieces,
    lines,
    height: occupiedHeight
  };
  if (content) {
    result.content = content;
  }
  return result;
}

function roundTiming(value) {
  return Number(value.toFixed(3));
}

function numberFromProfile(profile, key) {
  return Number(profile?.[key] || 0);
}

function sumProfileTimings(profile, keys) {
  return roundTiming(keys.reduce((sum, key) => sum + numberFromProfile(profile, key), 0));
}

function toPerformanceSummary(profile = {}) {
  return {
    layoutMs: sumProfileTimings(profile, [
      "paginationPlacementPrepMs",
      "actorMeasurementMs",
      "keepWithNextResolutionMs",
      "wholeFormationOverflowMs",
      "keepWithNextActionMs",
      "actorPlacementMs",
      "actorOverflowMs",
      "genericSplitMs"
    ]),
    materializeMs: roundTiming(numberFromProfile(profile, "flowMaterializeMs")),
    resolveLinesMs: roundTiming(numberFromProfile(profile, "flowResolveLinesMs")),
    buildTokensMs: roundTiming(numberFromProfile(profile, "flowBuildTokensMs")),
    wrapStreamMs: roundTiming(numberFromProfile(profile, "flowWrapStreamMs")),
    bidiMs: roundTiming(numberFromProfile(profile, "flowBidiSplitMs")),
    scriptSplitMs: roundTiming(numberFromProfile(profile, "flowScriptSplitMs")),
    wordSegmentMs: roundTiming(numberFromProfile(profile, "flowWordSegmentMs")),
    actorMeasurementMs: roundTiming(numberFromProfile(profile, "actorMeasurementMs")),
    actorPlacementMs: roundTiming(numberFromProfile(profile, "actorPlacementMs")),
    actorOverflowMs: roundTiming(numberFromProfile(profile, "actorOverflowMs")),
    textMeasurementCacheHits: numberFromProfile(profile, "textMeasurementCacheHits"),
    textMeasurementCacheMisses: numberFromProfile(profile, "textMeasurementCacheMisses"),
    colliderFieldQueryCalls: numberFromProfile(profile, "colliderFieldQueryCalls"),
    colliderFieldNarrowphaseCalls: numberFromProfile(profile, "colliderFieldNarrowphaseCalls")
  };
}


function createHiddenDocumentForRequest(mode, input = {}) {
  const prepared = createEngineInputsForRequest(mode, input);

  return {
    request: prepared.request,
    fragment: prepared.fragment,
    hiddenDocument: prepared.document
  };
}

function buildParagraphStyles(request) {
  const baseParagraphStyle = isPlainObject(request.styles?.p) ? request.styles.p : {};
  return {
    ...request.styles,
    p: {
      allowLineSplit: true,
      orphans: 1,
      widows: 1,
      marginBottom: 0,
      ...baseParagraphStyle
    }
  };
}

function buildLayoutForRequest(request, height, overrides = {}) {
  return {
    pageSize: {
      width: request.width,
      height
    },
    margins: request.margins,
    fontFamily: request.fontFamily,
    fontSize: request.fontSize,
    lineHeight: request.lineHeight,
    lineHeightMode: request.lineHeightMode,
    lineHeightAdjustment: request.lineHeightAdjustment,
    lang: request.lang,
    direction: request.direction,
    hyphenation: request.hyphenation,
    ...overrides
  };
}

function buildFontsForRequest(request) {
  return {
    regular: request.fontFamily
  };
}

function createEngineDocument({ layout, fonts, styles, elements }) {
  return {
    documentVersion: "1.1",
    layout,
    fonts,
    styles,
    elements
  };
}

function getElementText(element) {
  if (!isPlainObject(element)) return "";
  if (Array.isArray(element.children) && element.children.length > 0) {
    return element.children.map(getElementText).join("");
  }
  return String(element.content || "");
}

function hasTextContent(element) {
  return getElementText(element).length > 0;
}

function buildAstFragmentAndElements(source) {
  const rawElements = Array.isArray(source) ? source : (Array.isArray(source?.elements) ? source.elements : []);
  const elements = rawElements.map((element, index) => {
    if (!isPlainObject(element)) return element;
    const properties = isPlainObject(element.properties) ? element.properties : {};
    if (typeof properties.sourceId === "string" && properties.sourceId) {
      return element;
    }
    return { ...element, properties: { ...properties, sourceId: `author:ast:${index}` } };
  });

  const paragraphs = [];
  let cursor = 0;

  for (const element of elements) {
    if (!hasTextContent(element)) continue;
    const properties = isPlainObject(element.properties) ? element.properties : {};
    const sourceId = String(properties.sourceId || "");
    const text = getElementText(element);
    if (paragraphs.length > 0) {
      const prev = paragraphs[paragraphs.length - 1];
      prev.separatorAfter = "\n\n";
      prev.separatorLength = 2;
      cursor += 2;
    }
    const start = cursor;
    const end = start + text.length;
    paragraphs.push({ sourceId, text, start, end, separatorAfter: "", separatorLength: 0 });
    cursor = end;
  }

  return {
    fragment: {
      normalizedText: paragraphs.map((paragraph) => paragraph.text + paragraph.separatorAfter).join(""),
      paragraphs
    },
    elements
  };
}

function createEngineInputBundle(request, fragment, layout, fonts, styles, elements) {
  return {
    request,
    fragment,
    document: createEngineDocument({ layout, fonts, styles, elements: lowerBrowserBidiHints(elements) })
  };
}

function shouldLowerBrowserBidiHint(element) {
  if (!isPlainObject(element)) return false;
  const type = String(element.type || "").trim();
  return type === "p" || type === "span" || type === "text";
}

function lowerBrowserBidiHints(elements) {
  if (!Array.isArray(elements)) return elements;
  return elements.map((element) => {
    if (!isPlainObject(element)) return element;
    const children = Array.isArray(element.children)
      ? lowerBrowserBidiHints(element.children)
      : element.children;
    if (!shouldLowerBrowserBidiHint(element)) {
      return children === element.children ? element : { ...element, children };
    }
    const properties = isPlainObject(element.properties) ? element.properties : {};
    return {
      ...element,
      ...(children === undefined ? {} : { children }),
      properties: {
        ...properties,
        _layoutmasterBidiScope: properties._layoutmasterBidiScope || "dom-block"
      }
    };
  });
}

function createLetterPageDefaults(options = {}) {
  return {
    width: 612,
    height: 792,
    margins: { top: 72, right: 72, bottom: 72, left: 72 },
    ...options
  };
}

function createEngineInputsForRequest(mode, input = {}) {
  const request = input;
  const styles = buildParagraphStyles(request);
  const layout = buildLayoutForRequest(
    request,
    mode === "form" ? OPEN_HEIGHT : request.height,
    buildWorldPlainLayoutForExclusions(request.exclusions)
  );
  const fonts = buildFontsForRequest(request);

  if (request.format === "ast" || request.astSource) {
    const ast = buildAstFragmentAndElements(request.astSource);
    const elements = prependExclusionActors(request.exclusions, ast.elements);

    return createEngineInputBundle(request, ast.fragment, layout, fonts, styles, elements);
  }

  const fragment = buildFragmentModel(request.content);
  const paragraphMarginBottom = parseCssPxValue(request.styles?.p?.marginBottom) ?? request.fontSize;
  const paragraphElements = fragment.paragraphs.map((paragraph) => ({
    type: "p",
    content: paragraph.text,
    properties: {
      sourceId: paragraph.sourceId,
      marginBottom: paragraph.separatorLength >= 2 ? paragraphMarginBottom : 0
    }
  }));
  const elements = prependExclusionActors(request.exclusions, paragraphElements);

  return createEngineInputBundle(request, fragment, layout, fonts, styles, elements);
}

function createEngineInputsForFlowRequest(sourceRequest, targetRequests) {
  const prepared = createEngineInputsForRequest("fit", sourceRequest);
  const pageTemplates = targetRequests.map((target, pageIndex) => ({
    pageIndex,
    pageSize: {
      width: target.width,
      height: target.height
    },
    margins: target.margins
  }));
  const firstTarget = targetRequests[0] || sourceRequest;

  return {
    ...prepared,
    document: {
      ...prepared.document,
      layout: {
        ...prepared.document.layout,
        pageSize: {
          width: firstTarget.width,
          height: firstTarget.height
        },
        margins: firstTarget.margins,
        pageTemplates
      }
    }
  };
}

function createEngineInputsForPourRequest(input = {}, field) {
  const request = input;
  const styles = buildParagraphStyles(request);
  const layout = buildLayoutForRequest(
    request,
    request.height,
    {
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      microLanePolicy: "balanced"
    }
  );
  const fonts = buildFontsForRequest(request);
  const containedSpace = {
    kind: "contain",
    clip: true,
    strictLineBoxContainment: true,
    x: field.x,
    y: field.y,
    gap: field.gap,
    shape: field.shape,
    path: field.path,
    align: "left",
    exclusionAssembly: field.exclusionAssembly
  };
  const containedStyle = {
    width: field.width,
    height: field.height,
    marginTop: field.y
  };

  if (request.format === "ast" || request.astSource) {
    const ast = buildAstFragmentAndElements(request.astSource);
    const containedElements = ast.elements.map((element, index) => ({
      ...element,
      properties: {
        ...(element.properties || {}),
        ...(index === 0
          ? {
            style: {
              ...(element.properties?.style || {}),
              ...containedStyle
            },
            space: containedSpace
          }
          : {})
      }
    }));

    const elements = [{
      type: "story",
      content: "",
      children: containedElements
    }];

    return createEngineInputBundle(request, ast.fragment, layout, fonts, styles, elements);
  }
  const normalizedText = normalizeInputText(request.content);
  const fragment = {
    normalizedText,
    paragraphs: [{
      sourceId: buildFragmentSourceId(0),
      text: normalizedText,
      start: 0,
      end: normalizedText.length,
      separatorAfter: "",
      separatorLength: 0
    }]
  };
  const containedParagraph = {
    type: "p",
    content: normalizedText,
    properties: {
      sourceId: fragment.paragraphs[0].sourceId,
      style: containedStyle,
      space: containedSpace
    }
  };
  const elements = [{
    type: "story",
    content: "",
    children: [containedParagraph]
  }];

  return createEngineInputBundle(request, fragment, layout, fonts, styles, elements);
}

export function computeSnapshotSync(mode, request) {
  const prepared = createEngineInputsForRequest(mode, request);
  const fragment = prepared.fragment;
  const runner = createEmbeddedEngineRunner(prepared.document);

  const { pages, engineReport } = runner.run();

  const includeContentReport = mode !== "form";
  const regions = extractRegionResults(pages, engineReport.interactionMap, fragment, {
    includeContentReport,
    layout: runner.config.layout
  });
  const actualPieces = regions[0]?.pieces ?? [];
  const actualLines = regions[0]?.lines ?? [];
  const content = includeContentReport ? regions[0]?.content : undefined;

  const result = createResult({
    pieces: actualPieces,
    lines: actualLines,
    occupiedHeight: computePageOccupiedHeight(pages.length > 0 ? pages[0] : null),
    content
  });
  result.performance = toPerformanceSummary(engineReport.profile);
  return result;
}

export function computeFlowSnapshotSync(sourceRequest, targetRequests) {
  const prepared = createEngineInputsForFlowRequest(sourceRequest, targetRequests);
  const fragment = prepared.fragment;
  const runner = createEmbeddedEngineRunner(prepared.document);

  const { pages, engineReport } = runner.run({
    stopAtPage: Math.max(0, targetRequests.length - 1)
  });
  const regions = extractRegionResults(pages, engineReport.interactionMap, fragment, {
    includeContentReport: true,
    layout: runner.config.layout
  });
  const fullText = String(fragment?.normalizedText || "");
  let remainingText = fullText;

  const placements = targetRequests.map((target, index) => {
    const region = regions[index];
    if (region?.content) {
      const content = {
        ...region.content,
        sourceLength: region.content.consumed.length + region.content.remaining.length
      };
      remainingText = content.remaining.text;
      return {
        index,
        pieces: region.pieces,
        lines: region.lines || [],
        height: region.height,
        content
      };
    }

    return {
      index,
      pieces: [],
      lines: [],
      height: 0,
      content: {
        consumed: { text: "", length: 0 },
        remaining: { text: remainingText, length: remainingText.length },
        complete: remainingText.length === 0,
        hyphenated: false,
        sourceLength: fullText.length
      }
    };
  });
  const consumedText = placements.map((placement) => placement.content.consumed.text).join("");
  const lastContent = placements[placements.length - 1]?.content;

  return {
    placements,
    content: {
      consumed: { text: consumedText, length: consumedText.length },
      remaining: {
        text: lastContent?.remaining.text ?? fullText,
        length: lastContent?.remaining.length ?? fullText.length
      },
      complete: lastContent?.complete ?? fullText.length === 0,
      hyphenated: lastContent?.hyphenated ?? false,
      sourceLength: fullText.length
    },
    performance: toPerformanceSummary(engineReport.profile)
  };
}

export function computePourSnapshotSync(field, request) {
  const prepared = createEngineInputsForPourRequest(request, field);
  const fragment = prepared.fragment;
  const runner = createEmbeddedEngineRunner(prepared.document);

  const { pages, engineReport } = runner.run();
  const regions = extractRegionResults(pages, engineReport.interactionMap, fragment, {
    includeContentReport: true,
    layout: runner.config.layout
  });
  const actualPieces = regions[0]?.pieces ?? [];
  const actualLines = regions[0]?.lines ?? [];
  const content = regions[0]?.content;

  const result = createResult({
    pieces: actualPieces,
    lines: actualLines,
    occupiedHeight: computePageOccupiedHeight(pages.length > 0 ? pages[0] : null),
    content
  });
  result.performance = toPerformanceSummary(engineReport.profile);
  return result;
}

export function computeProduceSnapshotSync(documentInput) {
  const runner = createEmbeddedEngineRunner(documentInput);
  const { pages, engineReport } = runner.run();
  const regions = extractRegionResults(pages, engineReport.interactionMap, null, {
    layout: runner.config.layout
  });

  return {
    pages: regions.map((region, index) => {
      const page = pages[index] || {};
      return {
        index: Number(page.index ?? region.index ?? index),
        width: Number(page.width || 0),
        height: Number(page.height || 0),
        occupiedHeight: region.height,
        pieces: region.pieces,
        lines: region.lines
      };
    }),
    performance: toPerformanceSummary(engineReport.profile)
  };
}

export function createDocumentFromProduceElements(source, options = {}) {
  const elements = Array.isArray(source) ? source : (Array.isArray(source?.elements) ? source.elements : []);
  const content = JSON.stringify({ elements });
  const request = normalizeRequest(content, createLetterPageDefaults(options), "fit");
  return createEngineInputsForRequest("fit", request).document;
}

export function createFitResult(snapshot) {
  return {
    pieces: snapshot.pieces,
    lines: snapshot.lines || [],
    height: snapshot.height,
    content: snapshot.content,
    performance: snapshot.performance
  };
}

export function createFormResult(snapshot) {
  return {
    pieces: snapshot.pieces,
    lines: snapshot.lines || [],
    height: snapshot.height,
    performance: snapshot.performance
  };
}

export function createEmptyPerformance() {
  return {
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
  };
}

export function sumPerformance(total, next) {
  const base = total || createEmptyPerformance();
  const incoming = next || createEmptyPerformance();
  return {
    layoutMs: roundTiming(base.layoutMs + incoming.layoutMs),
    materializeMs: roundTiming(base.materializeMs + incoming.materializeMs),
    resolveLinesMs: roundTiming(base.resolveLinesMs + incoming.resolveLinesMs),
    buildTokensMs: roundTiming(base.buildTokensMs + incoming.buildTokensMs),
    wrapStreamMs: roundTiming(base.wrapStreamMs + incoming.wrapStreamMs),
    bidiMs: roundTiming(base.bidiMs + incoming.bidiMs),
    scriptSplitMs: roundTiming(base.scriptSplitMs + incoming.scriptSplitMs),
    wordSegmentMs: roundTiming(base.wordSegmentMs + incoming.wordSegmentMs),
    actorMeasurementMs: roundTiming(base.actorMeasurementMs + incoming.actorMeasurementMs),
    actorPlacementMs: roundTiming(base.actorPlacementMs + incoming.actorPlacementMs),
    actorOverflowMs: roundTiming(base.actorOverflowMs + incoming.actorOverflowMs),
    textMeasurementCacheHits: base.textMeasurementCacheHits + incoming.textMeasurementCacheHits,
    textMeasurementCacheMisses: base.textMeasurementCacheMisses + incoming.textMeasurementCacheMisses,
    colliderFieldQueryCalls: base.colliderFieldQueryCalls + incoming.colliderFieldQueryCalls,
    colliderFieldNarrowphaseCalls: base.colliderFieldNarrowphaseCalls + incoming.colliderFieldNarrowphaseCalls
  };
}

export function debugBuildHiddenDocument(content = "", options = {}, mode = "form") {
  const normalizedMode = String(mode || "form").trim().toLowerCase() === "fit" ? "fit" : "form";
  return createHiddenDocumentForRequest(normalizedMode, normalizeRequest(content, options, normalizedMode)).hiddenDocument;
}

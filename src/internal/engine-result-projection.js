import {
  applyContentReportsToRegions
} from "./content-report-helper.js";

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function positiveExtent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

export function computePageOccupiedHeight(page) {
  if (!page || !Array.isArray(page.boxes)) {
    return 0;
  }

  let maxBottom = 0;
  for (const box of page.boxes) {
    const bottom = Number(box?.y || 0) + Number(box?.h || 0);
    if (Number.isFinite(bottom) && bottom > maxBottom) {
      maxBottom = bottom;
    }
  }
  return maxBottom;
}

function buildTargetId(meta, pageIndex) {
  const engineKey = String(meta?.engineKey || "");
  if (engineKey) {
    return engineKey;
  }
  const sourceId = String(meta?.sourceId || "unknown");
  const fragmentIndex = Number(meta?.fragmentIndex || 0);
  return `${sourceId}#${fragmentIndex}@${pageIndex}`;
}

function buildBoxLookup(page) {
  const lookup = new Map();
  const pageIndex = Number(page?.index || 0);

  for (const box of page?.boxes || []) {
    const targetId = buildTargetId(box.meta, pageIndex);
    const boxes = lookup.get(targetId);
    if (boxes) {
      boxes.push(box);
    } else {
      lookup.set(targetId, [box]);
    }
  }

  return lookup;
}

function getSourceId(box) {
  return typeof box?.meta?.sourceId === "string"
    ? box.meta.sourceId
    : (typeof box?.properties?.sourceId === "string" ? box.properties.sourceId : "");
}

function getBoxShape(box) {
  const properties = box?.properties || {};
  const clipShape = String(properties._clipShape || properties._imageClipShape || "").trim();
  if (clipShape === "circle") return "circle";
  if (clipShape === "ellipse") return "ellipse";
  if (Array.isArray(properties._clipAssembly) || Array.isArray(properties._imageClipAssembly)) return "assembly";
  if (box?.style?.borderRadius) return "rounded";
  return "rect";
}

function buildSegmentBoundsByLine(target) {
  const byLine = new Map();

  for (const unit of target?.units || []) {
    const lineIndex = Number(unit?.lineIndex);
    const segmentIndex = Number(unit?.segmentLogicalIndex);
    if (!Number.isFinite(lineIndex) || !Number.isFinite(segmentIndex)) {
      continue;
    }

    const x0 = Number.isFinite(Number(unit?.segmentX0)) ? Number(unit.segmentX0) : Number(unit?.x0);
    const x1 = Number.isFinite(Number(unit?.segmentX1)) ? Number(unit.segmentX1) : Number(unit?.x1);
    if (!Number.isFinite(x0) || !Number.isFinite(x1)) {
      continue;
    }

    let lineBounds = byLine.get(lineIndex);
    if (!lineBounds) {
      lineBounds = new Map();
      byLine.set(lineIndex, lineBounds);
    }

    const existing = lineBounds.get(segmentIndex);
    const top = Number(unit?.y0);
    const bottom = Number(unit?.y1);
    if (existing) {
      existing.left = Math.min(existing.left, x0);
      existing.right = Math.max(existing.right, x1);
      if (Number.isFinite(top)) existing.top = Math.min(existing.top, top);
      if (Number.isFinite(bottom)) existing.bottom = Math.max(existing.bottom, bottom);
    } else {
      lineBounds.set(segmentIndex, {
        left: x0,
        right: x1,
        top: Number.isFinite(top) ? top : null,
        bottom: Number.isFinite(bottom) ? bottom : null,
        direction: unit?.segmentDirection
      });
    }
  }

  return byLine;
}

function copyStyleFields(target, style) {
  if (!isPlainObject(style)) {
    return;
  }

  if (style.fontFamily != null) target.fontFamily = String(style.fontFamily);
  if (Number.isFinite(Number(style.fontSize))) target.fontSize = Number(style.fontSize);
  if (Number.isFinite(Number(style.letterSpacing))) target.letterSpacing = Number(style.letterSpacing);
  if (style.fontWeight != null) target.fontWeight = String(style.fontWeight);
  if (style.fontStyle != null) target.fontStyle = String(style.fontStyle);
  if (style.color) target.color = String(style.color);
}

function clonePieceMetadataValue(value) {
  if (Array.isArray(value)) {
    return value.map(clonePieceMetadataValue);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, clonePieceMetadataValue(childValue)])
    );
  }
  return value;
}

function isInternalUnderscoreField(key) {
  return key === "__vmprintZoneDebug"
    || key === "_lineOffsets"
    || key === "_lineWidths"
    || key === "_lineYOffsets"
    || key === "_sourceSliceStart"
    || key === "_isFirstLine"
    || key === "_isLastLine"
    || key === "_isFirstFragmentInLine"
    || key === "_isLastFragmentInLine"
    || key.startsWith("_carry")
    || key.startsWith("_interaction")
    || key.startsWith("_table")
    || key.startsWith("_worldPlain");
}

function copyUnderscoreFields(target, source) {
  if (!isPlainObject(source)) {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith("_")
      && !isInternalUnderscoreField(key)
      && !Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = clonePieceMetadataValue(value);
    }
  }
}

function createPieceFromSegment({
  rawSegment,
  rawBox,
  bounds,
  targetOffsetX,
  targetOffsetY,
  line,
  lineIndex,
  pieceIndex,
  sourceId,
  shape
}) {
  const inlineObject = rawSegment?.inlineObject || null;
  const kind = inlineObject
    ? inlineObject.kind === "image" ? "inline-image" : "inline-box"
    : "text";
  const text = kind === "inline-box"
    ? String(inlineObject?.text || "")
    : String(rawSegment?.text || "");

  if (!text && !inlineObject) {
    return null;
  }

  const lineTop = Number(line?.top ?? 0) + targetOffsetY;
  const lineBottom = Number(line?.bottom ?? line?.top ?? 0) + targetOffsetY;
  const pieceTop = inlineObject && Number.isFinite(Number(bounds.top))
    ? Number(bounds.top) + targetOffsetY
    : lineTop;
  const pieceBottom = inlineObject && Number.isFinite(Number(bounds.bottom))
    ? Number(bounds.bottom) + targetOffsetY
    : lineBottom;
  const inlineMetrics = isPlainObject(rawSegment?.inlineMetrics) ? rawSegment.inlineMetrics : null;
  const inlineWidth = inlineObject && Number.isFinite(Number(inlineMetrics?.contentWidth))
    ? Number(inlineMetrics.contentWidth)
    : null;
  const inlineHeight = inlineObject && Number.isFinite(Number(inlineMetrics?.contentHeight))
    ? Number(inlineMetrics.contentHeight)
    : null;
  const verticalAlign = String(inlineMetrics?.verticalAlign || rawSegment?.style?.verticalAlign || "").trim();
  const alignedInlineTop = inlineObject
    && inlineHeight != null
    && verticalAlign === "middle"
    ? lineTop + Math.max(0, (lineBottom - lineTop - inlineHeight) / 2)
    : null;
  const piece = {
    x: Number(bounds.left) + targetOffsetX,
    y: alignedInlineTop ?? pieceTop,
    width: positiveExtent(inlineWidth ?? (Number(bounds.right) - Number(bounds.left))),
    height: positiveExtent(inlineHeight ?? (pieceBottom - pieceTop)),
    baselineY: Number(line?.baseline ?? line?.top ?? 0) + targetOffsetY,
    lineIndex,
    pieceIndex,
    kind,
    direction: rawSegment?.direction || bounds.direction || line?.direction || "ltr"
  };

  if (text) piece.text = text;
  if (inlineObject) piece.shape = shape;
  if (sourceId) piece._sourceId = sourceId;
  if (Number.isFinite(Number(rawSegment?.sourceStart))) piece._sourceStart = Number(rawSegment.sourceStart);
  if (Number.isFinite(Number(rawSegment?.sourceEnd))) piece._sourceEnd = Number(rawSegment.sourceEnd);
  if (kind === "text" && Number.isFinite(Number(rawSegment?.ascent))) piece.ascent = Number(rawSegment.ascent);
  if (kind === "text" && Number.isFinite(Number(rawSegment?.descent))) piece.descent = Number(rawSegment.descent);

  copyUnderscoreFields(piece, rawBox?.properties);
  copyUnderscoreFields(piece, rawSegment);
  copyStyleFields(piece, rawSegment?.style);
  return piece;
}

function hasTextLines(box) {
  return Array.isArray(box?.lines) && box.lines.some((line) => Array.isArray(line) && line.length > 0);
}

function createPieceFromBox({ rawBox, pieceIndex, sourceId, shape }) {
  const width = positiveExtent(rawBox?.w);
  const height = positiveExtent(rawBox?.h);
  if (!sourceId || width <= 0 || height <= 0 || hasTextLines(rawBox)) {
    return null;
  }

  const piece = {
    x: Number(rawBox?.x || 0),
    y: Number(rawBox?.y || 0),
    width,
    height,
    baselineY: Number(rawBox?.y || 0) + height,
    lineIndex: 0,
    pieceIndex,
    kind: "inline-box",
    direction: rawBox?.style?.direction || "ltr",
    shape,
    _sourceId: sourceId
  };

  const text = String(rawBox?.content || "");
  if (text) piece.text = text;

  copyUnderscoreFields(piece, rawBox?.properties);
  copyStyleFields(piece, rawBox?.style);
  return piece;
}

function projectPage(page, interactionPage) {
  const boxLookup = buildBoxLookup(page);
  const pieces = [];
  const lines = [];
  const projectedBoxes = new Set();

  for (const target of interactionPage?.targets || []) {
    const matchingBoxes = boxLookup.get(String(target?.targetId || ""));
    const rawBox = matchingBoxes?.shift();
    if (!rawBox || !Array.isArray(target?.lines)) {
      continue;
    }
    projectedBoxes.add(rawBox);

    const sourceId = getSourceId(rawBox);
    const shape = getBoxShape(rawBox);
    const targetOffsetX = Number(rawBox?.x || 0) - Number(target?.x || 0);
    const targetOffsetY = Number(rawBox?.y || 0) - Number(target?.y || 0);
    const segmentBoundsByLine = buildSegmentBoundsByLine(target);
    let pieceIndex = 0;

    for (const targetLine of target.lines) {
      const lineIndex = Number(targetLine?.index || 0);
      const lineTop = Number(targetLine?.top ?? 0) + targetOffsetY;
      const lineBottom = Number(targetLine?.bottom ?? targetLine?.top ?? 0) + targetOffsetY;
      const lineLeft = Number(targetLine?.left ?? targetLine?.x ?? 0) + targetOffsetX;
      const lineRight = Number(targetLine?.right ?? targetLine?.left ?? targetLine?.x ?? 0) + targetOffsetX;
      const direction = targetLine?.direction || "ltr";

      lines.push({
        x: lineLeft,
        y: lineTop,
        width: positiveExtent(lineRight - lineLeft),
        height: positiveExtent(lineBottom - lineTop),
        baselineY: Number(targetLine?.baseline ?? targetLine?.top ?? 0) + targetOffsetY,
        lineIndex,
        direction,
        ...(sourceId ? { _sourceId: sourceId } : {})
      });

      const rawLine = Array.isArray(rawBox.lines?.[lineIndex]) ? rawBox.lines[lineIndex] : [];
      const lineBounds = segmentBoundsByLine.get(lineIndex);
      if (!lineBounds) {
        continue;
      }

      for (let segmentIndex = 0; segmentIndex < rawLine.length; segmentIndex += 1) {
        const bounds = lineBounds.get(segmentIndex);
        if (!bounds) {
          continue;
        }
        const piece = createPieceFromSegment({
          rawSegment: rawLine[segmentIndex],
          rawBox,
          bounds,
          targetOffsetX,
          targetOffsetY,
          line: targetLine,
          lineIndex,
          pieceIndex: pieceIndex + 1,
          sourceId,
          shape
        });
        if (piece) {
          pieceIndex += 1;
          pieces.push(piece);
        }
      }
    }
  }

  let boxPieceIndex = 0;
  for (const rawBox of page?.boxes || []) {
    if (projectedBoxes.has(rawBox)) {
      continue;
    }
    const sourceId = getSourceId(rawBox);
    const piece = createPieceFromBox({
      rawBox,
      pieceIndex: boxPieceIndex + 1,
      sourceId,
      shape: getBoxShape(rawBox)
    });
    if (piece) {
      boxPieceIndex += 1;
      pieces.push(piece);
    }
  }

  return { pieces, lines };
}

export function extractRegionResults(pages, interactionMap, fragment, options = {}) {
  const interactionPages = Array.isArray(interactionMap) ? interactionMap : [];
  const regions = (pages || []).map((page, pageIndex) => {
    const interactionPage = interactionPages.find(
      (entry) => Number(entry?.index || 0) === Number(page?.index || 0)
    );
    const pageLayout = projectPage(page, interactionPage);

    return {
      index: pageIndex,
      pieces: pageLayout.pieces,
      lines: pageLayout.lines,
      height: computePageOccupiedHeight(page),
      renderedText: pageLayout.pieces.map((piece) => String(piece.text || "")).join("")
    };
  });

  return options.includeContentReport
    ? applyContentReportsToRegions(fragment, regions)
    : regions;
}

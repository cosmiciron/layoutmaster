import {
  applyContentReportsToRegions
} from "./content-report-helper.js";
import {
  buildParagraphMetrics,
  computeAlignedLineX,
  computeJustifyExtraAfter,
  computeLineWidth,
  createLineFrameAccessors,
  getStrongDirection,
  reorderItemsForVisualBidi,
  resolveVisualTextByItem,
  resolveParagraphDirection
} from "../../engine/dist/core/index.mjs";

const DEFAULT_LAYOUT = {
  direction: "auto",
  fontFamily: "Arial",
  fontSize: 16,
  justifyEngine: "basic",
  lineHeight: 1.2,
  lineHeightAdjustment: 0,
  lineHeightMode: "css"
};

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function positiveExtent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function validateUnit(value) {
  if (Number.isFinite(Number(value))) {
    return Number(value);
  }
  const match = String(value ?? "").trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : 0;
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

function resolveContentBox(box) {
  const style = box?.style || {};
  const paddingLeft = validateUnit(style.paddingLeft ?? style.padding ?? 0);
  const paddingRight = validateUnit(style.paddingRight ?? style.padding ?? 0);
  const paddingTop = validateUnit(style.paddingTop ?? style.padding ?? 0);
  const paddingBottom = validateUnit(style.paddingBottom ?? style.padding ?? 0);
  const borderLeft = validateUnit(style.borderLeftWidth ?? style.borderWidth ?? 0);
  const borderRight = validateUnit(style.borderRightWidth ?? style.borderWidth ?? 0);
  const borderTop = validateUnit(style.borderTopWidth ?? style.borderWidth ?? 0);
  const borderBottom = validateUnit(style.borderBottomWidth ?? style.borderWidth ?? 0);

  return {
    x: Number(box?.x || 0) + paddingLeft + borderLeft,
    y: Number(box?.y || 0) + paddingTop + borderTop,
    w: Math.max(0, Number(box?.w || 0) - paddingLeft - paddingRight - borderLeft - borderRight),
    h: Math.max(0, Number(box?.h || 0) - paddingTop - paddingBottom - borderTop - borderBottom)
  };
}

function shouldExposeVisualText(segment, visualText) {
  const text = String(segment?.text || "");
  if (!text || !visualText || text === visualText) {
    return false;
  }
  return getStrongDirection(text) !== "rtl";
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
  lineDirection,
  logicalSegmentIndex,
  visualSegmentIndex,
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
    direction: rawSegment?.direction || bounds.direction || line?.direction || "ltr",
    lineDirection: lineDirection || line?.direction || "ltr",
    logicalSegmentIndex,
    visualSegmentIndex
  };

  if (text) piece.text = text;
  if (shouldExposeVisualText(rawSegment, rawSegment?.visualText)) {
    piece.visualText = String(rawSegment.visualText);
  }
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

function createRawTextPageProjection(page, layout = DEFAULT_LAYOUT) {
  const pieces = [];
  const lines = [];

  for (const rawBox of page?.boxes || []) {
    if (!hasTextLines(rawBox)) {
      continue;
    }

    const rawLines = rawBox.lines || [];
    const sourceId = getSourceId(rawBox);
    const shape = getBoxShape(rawBox);
    const contentBox = resolveContentBox(rawBox);
    const boxStyle = rawBox.style || {};
    const fontSize = Number(boxStyle.fontSize || layout?.fontSize || DEFAULT_LAYOUT.fontSize);
    const lineHeight = Number(boxStyle.lineHeight || layout?.lineHeight || DEFAULT_LAYOUT.lineHeight);
    const lineFrame = createLineFrameAccessors(rawBox.properties || {}, contentBox.y, contentBox.w);
    const paragraphMetrics = buildParagraphMetrics(rawLines, fontSize, lineHeight, layout);
    const paragraphDirection = resolveParagraphDirection(
      rawLines,
      boxStyle,
      layout?.direction,
      DEFAULT_LAYOUT.direction
    );
    const letterSpacing = validateUnit(boxStyle.letterSpacing || 0);
    const textIndent = validateUnit(boxStyle.textIndent || 0);
    const align = boxStyle.textAlign;
    const justifyEngine = boxStyle.justifyEngine || layout?.justifyEngine || DEFAULT_LAYOUT.justifyEngine;
    let currentY = contentBox.y;
    let pieceIndex = 0;

    rawLines.forEach((rawLine, lineIndex) => {
      if (!Array.isArray(rawLine)) {
        return;
      }

      const metric = paragraphMetrics.lineMetrics[lineIndex] || {};
      const actualLineFontSize = metric.lineFontSize ?? fontSize;
      const referenceAscentScale = metric.referenceAscentScale ?? paragraphMetrics.paragraphReferenceAscentScale;
      const effectiveLineHeight = paragraphMetrics.paragraphHasInlineObjects
        ? (metric.effectiveLineHeight ?? paragraphMetrics.uniformLineHeight)
        : paragraphMetrics.uniformLineHeight;
      const nominalLineHeight = actualLineFontSize * lineHeight;
      const nominalLeading = nominalLineHeight - actualLineFontSize;
      const vOffset = nominalLeading / 2;
      const lineOffset = lineFrame.getLineOffset(lineIndex);
      const lineWidthLimit = lineFrame.getLineWidth(lineIndex);
      const lineOriginX = contentBox.x + lineOffset;
      const lineDirection = paragraphDirection;
      const lineTop = lineFrame.getLineY(lineIndex) ?? currentY;
      const baseline = lineTop + vOffset + (referenceAscentScale * actualLineFontSize);
      const bottom = lineTop + effectiveLineHeight;
      const lineWidth = computeLineWidth(rawLine);
      const adjustedLineWidth = lineWidth - letterSpacing;
      const lineX = computeAlignedLineX(
        lineIndex,
        lineDirection,
        lineOriginX,
        lineWidthLimit,
        textIndent,
        align,
        adjustedLineWidth
      );
      const justifyExtraAfter = computeJustifyExtraAfter(
        rawLine,
        lineIndex,
        rawLines.length,
        align,
        justifyEngine,
        lineWidthLimit,
        lineWidth
      );
      const rawItems = rawLine.map((seg, index) => ({
          seg,
          extra: justifyExtraAfter[index] || 0,
          logicalIndex: index
      }));
      const visualTextByLogicalSegment = resolveVisualTextByItem(rawItems, lineDirection);
      const lineItems = reorderItemsForVisualBidi(rawItems, lineDirection);

      let currentX = lineX;
      const boundsByLogicalSegment = new Map();
      for (let visualIndex = 0; visualIndex < lineItems.length; visualIndex += 1) {
        const { seg, extra, logicalIndex } = lineItems[visualIndex];
        const segWidth = positiveExtent(seg?.width);
        if (lineDirection === "rtl") {
          currentX -= segWidth;
        }
        const left = currentX;
        const right = currentX + segWidth;
        boundsByLogicalSegment.set(logicalIndex, {
          left,
          right,
          top: lineTop,
          bottom,
          direction: seg?.direction,
          visualSegmentIndex: visualIndex
        });
        if (lineDirection === "rtl") {
          currentX -= extra;
        } else {
          currentX += segWidth + extra;
        }
      }

      const lineLeft = boundsByLogicalSegment.size > 0
        ? Math.min(...Array.from(boundsByLogicalSegment.values()).map((bounds) => bounds.left))
        : lineX;
      const lineRight = boundsByLogicalSegment.size > 0
        ? Math.max(...Array.from(boundsByLogicalSegment.values()).map((bounds) => bounds.right))
        : lineX;

      lines.push({
        x: lineLeft,
        y: lineTop,
        width: positiveExtent(lineRight - lineLeft),
        height: positiveExtent(bottom - lineTop),
        baselineY: baseline,
        lineIndex,
        direction: lineDirection,
        ...(sourceId ? { _sourceId: sourceId } : {})
      });

      for (const item of lineItems) {
        const bounds = boundsByLogicalSegment.get(item.logicalIndex);
        if (!bounds) {
          continue;
        }
        const piece = createPieceFromSegment({
          rawSegment: {
            ...rawLine[item.logicalIndex],
            text: item.seg?.text ?? rawLine[item.logicalIndex]?.text,
            direction: item.seg?.direction ?? rawLine[item.logicalIndex]?.direction,
            visualText: visualTextByLogicalSegment[item.logicalIndex]
          },
          rawBox,
          bounds,
          targetOffsetX: 0,
          targetOffsetY: 0,
          line: { top: lineTop, bottom, baseline, direction: lineDirection },
          lineIndex,
          lineDirection,
          logicalSegmentIndex: item.logicalIndex,
          visualSegmentIndex: bounds.visualSegmentIndex,
          pieceIndex: pieceIndex + 1,
          sourceId,
          shape
        });
        if (piece) {
          pieceIndex += 1;
          pieces.push(piece);
        }
      }

      if (lineFrame.hasExplicitLineYOffsets) {
        currentY = Math.max(currentY, bottom);
      } else {
        currentY += effectiveLineHeight;
      }
    });
  }

  return { pieces, lines };
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

function projectPage(page, interactionPage, layout = DEFAULT_LAYOUT) {
  const boxLookup = buildBoxLookup(page);
  const rawTextProjection = createRawTextPageProjection(page, layout);
  const pieces = [...rawTextProjection.pieces];
  const lines = [...rawTextProjection.lines];
  const projectedBoxes = new Set((page?.boxes || []).filter(hasTextLines));

  if (pieces.length === 0 && lines.length === 0) {
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
          lineDirection: direction,
          logicalSegmentIndex: segmentIndex,
          visualSegmentIndex: null,
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
    const pageLayout = projectPage(page, interactionPage, options.layout || DEFAULT_LAYOUT);

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

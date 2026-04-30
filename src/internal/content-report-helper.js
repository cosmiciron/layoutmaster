function consumeLeadingContinuationSeparator(fullText, cursor) {
  if (!fullText || cursor <= 0 || cursor >= fullText.length) {
    return cursor;
  }

  const remaining = fullText.slice(cursor);
  const separatorMatch = remaining.match(/^(?:[ \t]*\n)+[ \t]*/);
  if (!separatorMatch) {
    return cursor;
  }

  const matched = separatorMatch[0];
  const newlineCount = (matched.match(/\n/g) || []).length;
  if (newlineCount < 2) {
    return cursor;
  }

  return Math.min(fullText.length, cursor + matched.length);
}

function clampParagraphOffset(paragraph, value) {
  return Math.max(0, Math.min(paragraph.text.length, Number(value || 0)));
}

function getParagraphMap(fragment) {
  return new Map((fragment?.paragraphs || []).map((paragraph) => [paragraph.sourceId, paragraph]));
}

function updateParagraphOffsetsFromPieces(fragment, pieces, paragraphOffsets) {
  const paragraphMap = getParagraphMap(fragment);

  for (const piece of pieces || []) {
    const sourceId = typeof piece?._sourceId === "string" ? piece._sourceId : "";
    const paragraph = paragraphMap.get(sourceId);
    if (!paragraph) {
      continue;
    }

    const sourceEnd = Number(piece?._sourceEnd);
    if (!Number.isFinite(sourceEnd)) {
      continue;
    }

    const nextOffset = clampParagraphOffset(paragraph, sourceEnd);
    const previousOffset = clampParagraphOffset(paragraph, paragraphOffsets.get(sourceId));
    if (nextOffset > previousOffset) {
      paragraphOffsets.set(sourceId, nextOffset);
    }
  }
}

function resolveConsumedCursor(fragment, paragraphOffsets) {
  let consumedCursor = 0;

  for (const paragraph of fragment?.paragraphs || []) {
    const paragraphOffset = clampParagraphOffset(paragraph, paragraphOffsets.get(paragraph.sourceId));
    if (paragraphOffset >= paragraph.text.length) {
      consumedCursor = Math.max(consumedCursor, paragraph.end + paragraph.separatorLength);
      continue;
    }

    if (paragraphOffset > 0) {
      consumedCursor = Math.max(consumedCursor, paragraph.start + paragraphOffset);
    }
  }

  return consumedCursor;
}

function detectInsertedHyphenFromPieces(fragment, pieces, paragraphOffsets) {
  const paragraphMap = getParagraphMap(fragment);
  let bestCursor = -1;
  let bestHyphenated = false;

  for (const piece of pieces || []) {
    const sourceId = typeof piece?._sourceId === "string" ? piece._sourceId : "";
    const paragraph = paragraphMap.get(sourceId);
    if (!paragraph) {
      continue;
    }

    const sourceStart = Number(piece?._sourceStart);
    const sourceEnd = Number(piece?._sourceEnd);
    if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd)) {
      continue;
    }

    const paragraphOffset = clampParagraphOffset(paragraph, paragraphOffsets.get(sourceId));
    if (paragraphOffset !== clampParagraphOffset(paragraph, sourceEnd)) {
      continue;
    }

    const cursor = paragraphOffset >= paragraph.text.length
      ? paragraph.end + paragraph.separatorLength
      : paragraph.start + paragraphOffset;
    if (cursor < bestCursor) {
      continue;
    }

    const pieceText = String(piece.text || "");
    const sourceSlice = paragraph.text.slice(
      clampParagraphOffset(paragraph, sourceStart),
      clampParagraphOffset(paragraph, sourceEnd)
    );
    const hyphenated = pieceText.endsWith("-")
      && sourceEnd < paragraph.text.length
      && !sourceSlice.endsWith("-");

    bestCursor = cursor;
    bestHyphenated = hyphenated;
  }

  return bestHyphenated;
}

function buildContentReport(fullText, consumedSourceText, remainingSourceText, hyphenated) {
  const consumedSourceLength = consumedSourceText.length;
  const remainingSourceLength = remainingSourceText.length;

  return {
    consumed: {
      text: consumedSourceText,
      length: consumedSourceLength
    },
    remaining: {
      text: remainingSourceText,
      length: remainingSourceLength
    },
    complete: remainingSourceLength === 0,
    hyphenated: Boolean(hyphenated && remainingSourceLength > 0),
    sourceLength: fullText.length
  };
}

function buildContentReportFromCursor(fragment, cursor, hyphenated = false) {
  const fullText = String(fragment?.normalizedText || "");
  const resolvedCursor = cursor > 0
    ? consumeLeadingContinuationSeparator(fullText, cursor)
    : cursor;

  return buildContentReport(
    fullText,
    fullText.slice(0, resolvedCursor),
    fullText.slice(resolvedCursor),
    hyphenated
  );
}

export function applyContentReportsToRegions(fragment, regions) {
  if (!Array.isArray(regions) || regions.length === 0) {
    return [];
  }

  const fullText = String(fragment?.normalizedText || "");
  const paragraphOffsets = new Map();
  let previousResolvedCursor = 0;

  return regions.map((region) => {
    updateParagraphOffsetsFromPieces(fragment, region?.pieces, paragraphOffsets);
    const cumulativeCursor = resolveConsumedCursor(fragment, paragraphOffsets);
    const cumulative = buildContentReportFromCursor(
      fragment,
      cumulativeCursor,
      detectInsertedHyphenFromPieces(fragment, region?.pieces, paragraphOffsets)
    );
    const regionConsumedText = fullText.slice(previousResolvedCursor, cumulative.consumed.length);
    previousResolvedCursor = cumulative.consumed.length;

    const content = buildContentReport(
      fullText,
      regionConsumedText,
      cumulative.remaining.text,
      cumulative.hyphenated
    );
    return {
      ...region,
      content
    };
  });
}

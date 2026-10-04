export interface QuoteVerificationResult {
  quoteText: string;
  status: 'verified' | 'unverified';
  matchedSourceText?: string;
  reason?: string;
  charOffset?: number;
  startOffset?: number;
  endOffset?: number;
  pageNumber?: number;
}

/**
  Strips Markdown formatting tags (bold, italic, code, blockquotes, outer quote marks,
  leading/trailing ellipsis … or ...) from AI-generated quote strings.
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/\*/g, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[\u2026\. "“'‘\s]+|[\u2026\. "”'’\s]+$/g, '')
    .trim();
}

/**
  Normalizes text for canonical matching:
  - Strips markdown formatting
  - Normalizes smart quotes (“, ”, ‘, ’ -> ", ')
  - Normalizes all hyphens including non-breaking hyphens (-, –, —, \u2011 -> -)
  - Strips soft hyphens (\u00AD)
  - Normalizes all unicode whitespace (non-breaking space \u00A0, narrow space \u202F, etc.) to standard space
  - Collapses all newlines, tabs, and multiple spaces into a single space
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*|__|[\*_`]/g, '')
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/\u00AD/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
    .replace(/[\r\n\t\s]+/g, ' ')
    .trim();
}

/**
  Extracts quote strings enclosed in quotation marks ("...", “...”, '...')
  or markdown blockquotes (> ...) from AI generated answers.
  Strips inner/outer markdown bolding or presentation wrappers.
 */
export function extractQuotesFromText(text: string): string[] {
  if (!text) return [];

  const quotes: string[] = [];

  // Match double quotes "..." or “...” (allow markdown tags inside or outside)
  const doubleQuoteRegex = /(?:\*\*|__)?["“]([^"“\n]{4,})(?:\*\*|__)?["”]/g;
  let match;
  while ((match = doubleQuoteRegex.exec(text)) !== null) {
    const rawMatch = match[1];
    const cleaned = stripMarkdown(rawMatch);
    if (cleaned.length >= 5 && !quotes.includes(cleaned)) {
      quotes.push(cleaned);
    }
  }

  // Match markdown blockquotes (> text)
  const blockquoteRegex = /^>\s*(.+)$/gm;
  while ((match = blockquoteRegex.exec(text)) !== null) {
    const cleaned = stripMarkdown(match[1]);
    if (cleaned.length >= 5 && !quotes.includes(cleaned)) {
      quotes.push(cleaned);
    }
  }

  // Fallback: match quotes formatted as `Quote: "..."` or `- "..."`
  if (quotes.length === 0) {
    const fallbackRegex = /["“']([^"“'\n]{5,})["”']/g;
    while ((match = fallbackRegex.exec(text)) !== null) {
      const cleaned = stripMarkdown(match[1]);
      if (cleaned.length >= 5 && !quotes.includes(cleaned)) {
        quotes.push(cleaned);
      }
    }
  }

  return quotes;
}

/**
  Builds a normalized string from raw document text along with a mapping array
  where mapIndex[i] holds the original character index in rawDoc for character i in normDoc.
 */
function buildDocIndexMap(rawDoc: string): { normDoc: string; mapIndex: number[] } {
  let normDoc = '';
  const mapIndex: number[] = [];

  let i = 0;
  const len = rawDoc.length;
  let inWhitespace = false;

  while (i < len) {
    const char = rawDoc[i];
    let stdChar = char;

    if (/[\u201C\u201D\u201E\u201F\u2033\u2036]/.test(char)) stdChar = '"';
    else if (/[\u2018\u2019\u201A\u201B\u2032\u2035]/.test(char)) stdChar = "'";
    else if (/[\u2011\u2012\u2013\u2014\u2015]/.test(char)) stdChar = '-';
    else if (char === '\u00AD') {
      i++;
      continue;
    }

    if (/\s/.test(stdChar) || /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/.test(stdChar)) {
      if (!inWhitespace) {
        if (normDoc.length > 0) {
          normDoc += ' ';
          mapIndex.push(i);
        }
        inWhitespace = true;
      }
    } else {
      inWhitespace = false;
      normDoc += stdChar;
      mapIndex.push(i);
    }
    i++;
  }

  return { normDoc, mapIndex };
}

/**
  Verifies a quote string against full document text, computing exact startOffset and endOffset.
  Applies strict normalized substring matching to avoid false-negatives on short quotes
  while strictly rejecting paraphrased or hallucinated text.
 */
export function verifyQuote(
  quoteText: string,
  fullDocText: string,
  totalPageCount = 1
): QuoteVerificationResult {
  let cleanedQuote = stripMarkdown(quoteText);
  let normQuote = normalizeText(cleanedQuote);

  if (!normQuote || !fullDocText) {
    return {
      quoteText: cleanedQuote || quoteText,
      status: 'unverified',
      reason: 'Empty quote or empty document text',
    };
  }

  const { normDoc, mapIndex } = buildDocIndexMap(fullDocText);

  // If quote contains internal ellipsis like "clause A... clause B", take the longest continuous segment for matching
  if (/[\u2026]|\.\.\./.test(normQuote)) {
    const segments = normQuote
      .split(/[\u2026]|\.\.\./)
      .map((s) => s.trim())
      .filter((s) => s.length >= 5);
    if (segments.length > 0) {
      // Pick longest segment
      segments.sort((a, b) => b.length - a.length);
      normQuote = normalizeText(segments[0]);
      cleanedQuote = segments[0];
    }
  }

  // 1. Primary: Exact Normalized Substring Search (Case-insensitive)
  let matchIdx = normDoc.toLowerCase().indexOf(normQuote.toLowerCase());
  let matchedLength = normQuote.length;

  // 2. Secondary: Match without trailing punctuation (period, comma, semicolon, quotes)
  if (matchIdx === -1) {
    const trimmedNormQuote = normQuote.replace(/[.,;:!?\u2026]+$/, '').trim();
    if (trimmedNormQuote.length >= 5) {
      matchIdx = normDoc.toLowerCase().indexOf(trimmedNormQuote.toLowerCase());
      if (matchIdx !== -1) {
        matchedLength = trimmedNormQuote.length;
      }
    }
  }

  // 3. Tertiary: Match ignoring hyphens/space differences
  if (matchIdx === -1) {
    const spaceQuote = normQuote.replace(/-/g, ' ').trim();
    const spaceNormDoc = normDoc.replace(/-/g, ' ');
    if (spaceQuote.length >= 5) {
      matchIdx = spaceNormDoc.toLowerCase().indexOf(spaceQuote.toLowerCase());
      if (matchIdx !== -1) {
        matchedLength = spaceQuote.length;
      }
    }
  }

  if (matchIdx !== -1 && mapIndex.length > matchIdx) {
    const startOffset = mapIndex[matchIdx];
    const endMatchIdx = Math.min(matchIdx + matchedLength - 1, mapIndex.length - 1);
    const endOffset = mapIndex[endMatchIdx] + 1;
    const matchedSourceText = fullDocText.slice(startOffset, endOffset);

    // Compute estimated page number based on character position
    const ratio = startOffset / Math.max(1, fullDocText.length);
    const pageNumber = Math.max(1, Math.ceil(ratio * totalPageCount));

    return {
      quoteText: cleanedQuote,
      status: 'verified',
      matchedSourceText,
      charOffset: startOffset,
      startOffset,
      endOffset,
      pageNumber,
    };
  }

  // 4. Fallback: Quote NOT found verbatim (paraphrased or hallucinated).
  const closestSource = findClosestSourcePassage(normQuote, normDoc);

  return {
    quoteText: cleanedQuote,
    status: 'unverified',
    matchedSourceText: closestSource || undefined,
    reason: 'Quote was paraphrased by AI (exact wording not found in text)',
  };
}

/**
  Finds the paragraph/sentence in the document text with the highest word overlap
  for unverified paraphrased quotes.
 */
function findClosestSourcePassage(quote: string, docText: string): string | null {
  const quoteWords = new Set(
    quote
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  if (quoteWords.size === 0) return null;

  const passages = docText
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 15);

  let bestPassage: string | null = null;
  let maxScore = 0;

  for (const passage of passages) {
    const passageWords = passage
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    let matchCount = 0;
    for (const word of quoteWords) {
      if (passageWords.includes(word)) {
        matchCount++;
      }
    }

    const score = matchCount / quoteWords.size;
    if (score > maxScore && score >= 0.4) {
      maxScore = score;
      bestPassage = passage;
    }
  }

  return bestPassage;
}

/**
  Verifies all quotes inside an AI answer text against full document text.
 */
export function verifyAllQuotesInAnswer(
  answerText: string,
  fullDocText: string,
  totalPageCount = 1
): QuoteVerificationResult[] {
  const quotes = extractQuotesFromText(answerText);
  return quotes.map((q) => verifyQuote(q, fullDocText, totalPageCount));
}

import { diffWords } from 'diff';
import { scoreChunksWithBM25, tokenizeText } from '@/lib/retriever';

export type SeverityLevel = 'high' | 'medium' | 'low';
export type ChangeType = 'modified' | 'added' | 'removed' | 'unchanged';

export interface WordDiffPart {
  added?: boolean;
  removed?: boolean;
  value: string;
}

export interface ClauseDiffItem {
  id: string;
  clauseTitle: string;
  changeType: ChangeType;
  severity: SeverityLevel;
  doc1Text?: string;
  doc2Text?: string;
  substantiveSummary: string;
  numericChange?: string;
  wordDiff?: WordDiffPart[];
}

export interface ComparisonReport {
  doc1Name: string;
  doc2Name: string;
  executiveSummary: string;
  stats: {
    totalChanges: number;
    highRiskChanges: number;
    mediumRiskChanges: number;
    lowRiskChanges: number;
  };
  diffs: ClauseDiffItem[];
}

const HIGH_RISK_KEYWORDS = [
  'liability',
  'cap',
  'indemn',
  'warranty',
  'guarantee',
  'termination',
  'liquidated',
  'penalt',
  'jurisdiction',
  'governing law',
  'arbitration',
  'payment',
  'fee',
  'price',
  'damages',
  'consequential',
  'availability',
  'incident',
  'retention',
  'rto',
  'rpo',
  'insurance',
];

/**
 * Clean LLM markdown output and safely parse JSON with truncated JSON repair.
 */
export function cleanAndParseJSONResponse(rawText: string): any {
  if (!rawText) throw new Error('Empty response from AI model');

  let cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn('Attempting truncated JSON repair...');
    const diffsIdx = cleaned.indexOf('"diffs"');
    if (diffsIdx !== -1) {
      const lastObjClose = cleaned.lastIndexOf('}');
      if (lastObjClose > diffsIdx) {
        const repaired = cleaned.substring(0, lastObjClose + 1) + '\n  ]\n}';
        const repairedCleaned = repaired.replace(/,\s*([\}\]])/g, '$1');
        try {
          return JSON.parse(repairedCleaned);
        } catch (repairErr) {
          console.error('JSON auto-repair failed:', repairErr);
        }
      }
    }
    throw err;
  }
}

/**
 * Calculates vocabulary overlap (Jaccard similarity) between two document texts.
 */
export function calculateDocumentSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;

  const words1 = new Set(tokenizeText(text1).filter((w) => w.length > 3));
  const words2 = new Set(tokenizeText(text2).filter((w) => w.length > 3));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  words1.forEach((w) => {
    if (words2.has(w)) intersection++;
  });

  const union = new Set([...words1, ...words2]).size;
  return intersection / union;
}

/**
 * Extracts monetary amounts, percentages, numbers, and timeline thresholds from text.
 */
export function extractNumbersAndCurrencies(text: string): string[] {
  if (!text) return [];
  const regex = /(?:AED|USD|EUR|GBP|\$|€|£)?\s*[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?\s*(?:%|calendar days|business days|days|hours|months|years|per month|per year)?/gi;
  const matches = text.match(regex) || [];
  return matches
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && /\d/.test(m));
}

/**
 * Splits contract text into logical clause/paragraph sections.
 */
export function splitContractIntoClauses(text: string): Array<{ id: string; title: string; content: string }> {
  if (!text) return [];

  const lines = text.split('\n');
  const clauses: Array<{ id: string; title: string; content: string }> = [];

  let currentTitle = 'General Overview';
  let currentLines: string[] = [];
  let clauseIndex = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isSectionHeading = /^(Section\s+\d+|[0-9]+\.\s+[A-Za-z\s]+|[A-Z\s]{4,})/.test(trimmed);
    const isClauseHeader = /^(Initial Term|Monthly [Ss]ervice [Ff]ee|Managed Service Fee|Invoice [Pp]ayment|Availability|Security [Ii]ncident|Security [Ll]og|Return|Acceptance|Insurance|General [Ll]iability|RTO|RPO|Termination|Feedback|Regulatory|Quarterly|Contract Price|Schedule and Delay|Variations|Defects|Indemnity)/i.test(trimmed);

    if (isSectionHeading || isClauseHeader) {
      if (currentLines.length > 0) {
        clauses.push({
          id: `clause-${clauseIndex++}`,
          title: currentTitle,
          content: currentLines.join(' '),
        });
        currentLines = [];
      }
      currentTitle = trimmed;
    } else {
      currentLines.push(trimmed);
    }
  }

  if (currentLines.length > 0) {
    clauses.push({
      id: `clause-${clauseIndex++}`,
      title: currentTitle,
      content: currentLines.join(' '),
    });
  }

  return clauses;
}

/**
 * Evaluates legal risk severity and generates fallback substantive explanation
 */
export function evaluateSeverityAndExplanation(
  title: string,
  doc1Text: string,
  doc2Text: string,
  changeType: ChangeType
): { severity: SeverityLevel; explanation: string } {
  if (changeType === 'unchanged') {
    return { severity: 'low', explanation: 'No substantive changes detected.' };
  }

  const titleLower = title.toLowerCase();
  const text1Lower = (doc1Text || '').toLowerCase();
  const text2Lower = (doc2Text || '').toLowerCase();

  const isHighRiskClause = HIGH_RISK_KEYWORDS.some((k) => titleLower.includes(k));

  if (changeType === 'added') {
    return {
      severity: isHighRiskClause ? 'high' : 'medium',
      explanation: `New clause added: "${title}". Introduces new contractual rights or obligations.`,
    };
  }

  if (changeType === 'removed') {
    return {
      severity: isHighRiskClause ? 'high' : 'medium',
      explanation: `Clause deleted: "${title}". Removes previous contractual terms or obligations.`,
    };
  }

  const nums1 = extractNumbersAndCurrencies(doc1Text);
  const nums2 = extractNumbersAndCurrencies(doc2Text);

  const numericShifts = nums2.filter((n) => !nums1.includes(n));

  if (numericShifts.length > 0) {
    return {
      severity: 'high',
      explanation: `Substantive numeric modification in "${title}": changes financial cap, timeline, SLA percentage, or retention period (e.g., from [${nums1.slice(0, 2).join(', ')}] to [${nums2.slice(0, 2).join(', ')}]).`,
    };
  }

  if (isHighRiskClause) {
    return {
      severity: 'high',
      explanation: `Material modification in high-risk clause "${title}". Directly impacts legal exposure, liabilities, or remedies.`,
    };
  }

  const lengthDiff = Math.abs((doc1Text || '').length - (doc2Text || '').length);
  if (lengthDiff > 80) {
    return {
      severity: 'medium',
      explanation: `Substantive expansion or restriction of provisions in "${title}".`,
    };
  }

  return {
    severity: 'low',
    explanation: `Minor rewording or stylistic modification in "${title}".`,
  };
}

/**
 * BM25 Semantic Alignment & Clause Diff Engine
 */
export function compareClausesWithBM25(
  text1: string,
  text2: string
): ClauseDiffItem[] {
  const clauses1 = splitContractIntoClauses(text1);
  const clauses2 = splitContractIntoClauses(text2);

  const diffs: ClauseDiffItem[] = [];
  const processed2Ids = new Set<string>();

  // Prepare BM25 chunks for doc2 clauses
  const chunks2 = clauses2.map((c, idx) => ({
    chunkIndex: idx,
    text: `${c.title} ${c.content}`,
    pageNumber: 1,
    clauseObj: c,
  }));

  let diffIndex = 1;

  for (const c1 of clauses1) {
    // Score all doc2 clauses against c1 using BM25
    const query = `${c1.title} ${c1.content.slice(0, 150)}`;
    const scored = scoreChunksWithBM25(query, chunks2);

    // Find best scoring BM25 match that hasn't been processed
    const bestMatch = (scored as Array<any>)
      .filter((s) => !processed2Ids.has(s.clauseObj.id))
      .sort((a, b) => b.score - a.score)[0];

    if (!bestMatch || bestMatch.score < 0.1) {
      // Removed clause in Version 2
      const { severity, explanation } = evaluateSeverityAndExplanation(
        c1.title,
        c1.content,
        '',
        'removed'
      );
      diffs.push({
        id: `diff-${diffIndex++}`,
        clauseTitle: c1.title,
        changeType: 'removed',
        severity,
        doc1Text: c1.content,
        doc2Text: '',
        substantiveSummary: explanation,
      });
    } else {
      const c2 = bestMatch.clauseObj;
      processed2Ids.add(c2.id);

      const norm1 = c1.content.replace(/\s+/g, ' ').trim();
      const norm2 = c2.content.replace(/\s+/g, ' ').trim();

      if (norm1 === norm2) {
        // Unchanged clause - skipped from diff list to keep diff report focused
        continue;
      } else {
        // Modified clause - perform word diffing
        const wordDiff = diffWords(c1.content, c2.content).map((part) => ({
          added: part.added,
          removed: part.removed,
          value: part.value,
        }));

        const { severity, explanation } = evaluateSeverityAndExplanation(
          c2.title || c1.title,
          c1.content,
          c2.content,
          'modified'
        );

        diffs.push({
          id: `diff-${diffIndex++}`,
          clauseTitle: c2.title || c1.title,
          changeType: 'modified',
          severity,
          doc1Text: c1.content,
          doc2Text: c2.content,
          substantiveSummary: explanation,
          wordDiff,
        });
      }
    }
  }

  // Identify newly added clauses in Version 2
  for (const c2 of clauses2) {
    if (!processed2Ids.has(c2.id)) {
      const { severity, explanation } = evaluateSeverityAndExplanation(
        c2.title,
        '',
        c2.content,
        'added'
      );
      diffs.push({
        id: `diff-${diffIndex++}`,
        clauseTitle: c2.title,
        changeType: 'added',
        severity,
        doc1Text: '',
        doc2Text: c2.content,
        substantiveSummary: explanation,
      });
    }
  }

  return diffs;
}

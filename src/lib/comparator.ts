export interface ClauseDiffItem {
  id: string;
  clauseTitle: string;
  changeType: 'modified' | 'added' | 'removed';
  severity: 'high' | 'medium' | 'low';
  doc1Text?: string;
  doc2Text?: string;
  substantiveSummary: string;
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

/**
 * Clean LLM markdown output and safely parse JSON
 */
export function cleanAndParseJSONResponse(rawText: string): any {
  if (!rawText) throw new Error('Empty response from AI model');

  // Strip markdown block quotes like ```json ... ```
  let cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Find first { or [ and last } or ]
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // Remove potential trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');

  return JSON.parse(cleaned);
}

/**
 * Splits contract text into logical clause/paragraph sections.
 */
export function splitContractIntoClauses(text: string): Array<{ title: string; content: string }> {
  if (!text) return [];

  const lines = text.split('\n');
  const clauses: Array<{ title: string; content: string }> = [];

  let currentTitle = 'General Overview';
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect section titles like "Section 01 of 12", "DEFINITIONS AND INTERPRETATION", "FEES AND PAYMENT", headings in caps, or numbered clauses
    const isSectionHeading = /^(Section\s+\d+|[A-Z\s]{4,}|[0-9]+\.\s+[A-Z\s]+)/.test(trimmed);
    const isClauseHeader = /^(Initial Term|Monthly [Ss]ervice [Ff]ee|Invoice [Pp]ayment|Availability|Security [Ii]ncident|Security [Ll]og|Return|Acceptance|Insurance|General [Ll]iability|RTO|RPO|Termination|Feedback|Regulatory|Quarterly)/i.test(trimmed);

    if (isSectionHeading || isClauseHeader) {
      if (currentLines.length > 0) {
        clauses.push({ title: currentTitle, content: currentLines.join(' ') });
        currentLines = [];
      }
      currentTitle = trimmed;
    } else {
      currentLines.push(trimmed);
    }
  }

  if (currentLines.length > 0) {
    clauses.push({ title: currentTitle, content: currentLines.join(' ') });
  }

  return clauses;
}


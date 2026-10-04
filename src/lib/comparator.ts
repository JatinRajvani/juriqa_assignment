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
  Splits contract text into logical clause/paragraph sections.
 */
export function splitContractIntoClauses(text: string): Array<{ title: string; content: string }> {
  if (!text) return [];

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);

  return paragraphs.map((content, idx) => {
    // Check if paragraph starts with section number e.g. "1. Term", "Section 4. Liability"
    const headingMatch = content.match(/^((?:Section|Clause|Article|\d+[\.\)]?)\s+[^\n\.]+)/i);
    const title = headingMatch ? headingMatch[1] : `Clause ${idx + 1}`;

    return { title, content };
  });
}

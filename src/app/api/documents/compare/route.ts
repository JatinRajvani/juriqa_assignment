import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';
import { generateTextWithFallback } from '@/lib/aiProvider';
import { cleanAndParseJSONResponse, ClauseDiffItem, compareClausesWithBM25 } from '@/lib/comparator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { doc1Id, doc2Id } = await req.json();

    if (!doc1Id || !doc2Id) {
      return NextResponse.json({ error: 'doc1Id and doc2Id are required' }, { status: 400 });
    }

    if (doc1Id === doc2Id) {
      return NextResponse.json(
        { error: 'Cannot compare a document with itself. Please select two different document versions.' },
        { status: 400 }
      );
    }

    const doc1 = await DocumentModel.findById(doc1Id).lean();
    const doc2 = await DocumentModel.findById(doc2Id).lean();

    if (!doc1 || !doc2) {
      return NextResponse.json({ error: 'One or both documents not found' }, { status: 404 });
    }

    const doc1Text = doc1.extractedText || '';
    const doc2Text = doc2.extractedText || '';

    // 1. Precise Local Alignment & Word-Level Diffing (BM25)
    const baseDiffs = compareClausesWithBM25(doc1Text, doc2Text);

    let finalDiffs = baseDiffs;
    let executiveSummary = `Substantive contract comparison completed between **${doc1.filename}** and **${doc2.filename}**. Identified **${baseDiffs.length} material clause modifications**.`;

    // 2. AI Executive Summary & Legal Explanation Enhancement (Compact Payload)
    try {
      const systemPrompt = `You are a Senior Legal Tech Counsel. You are provided with extracted clause diffs between Version 1 (${doc1.filename}) and Version 2 (${doc2.filename}).

YOUR TASK:
1. Provide a concise 2-3 sentence executive summary of overall legal risk shifts, financial changes, and operational impacts.
2. For each diff item, refine the substantive summary into a single clear plain-language sentence detailing exact numbers, fees, percentages, timeline shifts, or added/removed duties.

Return ONLY a single valid JSON object:
{
  "executiveSummary": "Concise executive overview of material changes.",
  "summaries": [
    {
      "id": "diff-1",
      "substantiveSummary": "Plain language explanation of what changed in substance."
    }
  ]
}`;

      const diffsPayload = baseDiffs.map((d) => ({
        id: d.id,
        title: d.clauseTitle,
        changeType: d.changeType,
        doc1Excerpt: (d.doc1Text || '').slice(0, 300),
        doc2Excerpt: (d.doc2Text || '').slice(0, 300),
      }));

      const userPrompt = `Version 1: "${doc1.filename}"\nVersion 2: "${doc2.filename}"\n\nClause Diffs:\n${JSON.stringify(diffsPayload, null, 2)}`;

      const { text } = await generateTextWithFallback({
        system: systemPrompt,
        prompt: userPrompt,
      });

      const aiParsed = cleanAndParseJSONResponse(text);

      if (aiParsed.executiveSummary) {
        executiveSummary = aiParsed.executiveSummary;
      }

      if (Array.isArray(aiParsed.summaries)) {
        const summaryMap = new Map<string, string>(
          aiParsed.summaries.map((s: any) => [s.id, s.substantiveSummary])
        );

        finalDiffs = baseDiffs.map((d) => ({
          ...d,
          substantiveSummary: summaryMap.get(d.id) || d.substantiveSummary,
        }));
      }
    } catch (aiErr) {
      console.warn('AI Summary Enhancement skipped (using BM25 local explanations):', aiErr);
    }

    const stats = {
      totalChanges: finalDiffs.length,
      highRiskChanges: finalDiffs.filter((d) => d.severity === 'high').length,
      mediumRiskChanges: finalDiffs.filter((d) => d.severity === 'medium').length,
      lowRiskChanges: finalDiffs.filter((d) => d.severity === 'low').length,
    };

    return NextResponse.json({
      report: {
        doc1Name: doc1.filename,
        doc2Name: doc2.filename,
        executiveSummary,
        stats,
        diffs: finalDiffs,
      },
    });
  } catch (error) {
    console.error('Error in document comparison:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Comparison Error: ${error.message}`
            : 'Document comparison failed.',
      },
      { status: 500 }
    );
  }
}

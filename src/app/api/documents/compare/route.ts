import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';
import { getGeminiModel, getGroqModel } from '@/lib/aiProvider';
import { cleanAndParseJSONResponse, ClauseDiffItem, compareClausesWithBM25 } from '@/lib/comparator';
import { generateText } from 'ai';
import { diffWords } from 'diff';

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

    // =========================================================================
    // STEP 1: DIRECT FULL DOCUMENT COMPARISON WITH GEMINI (High Context Limit)
    // =========================================================================
    const geminiModel = getGeminiModel();
    if (geminiModel) {
      try {
        console.log('Attempting FULL document direct comparison with Gemini...');

        const fullSystemPrompt = `You are a Senior Legal Tech Counsel. You are provided with TWO FULL CONTRACT DOCUMENTS:
Document 1 (Version 1: "${doc1.filename}") and Document 2 (Version 2: "${doc2.filename}").

YOUR TASK:
Analyze both full contracts. Extract all material differences, pricing changes, liability shifts, warranty periods, delay penalties, and added/removed clauses.

CRITICAL REQUIREMENT: Return ONLY a single valid JSON object strictly matching this format:
{
  "executiveSummary": "Concise 2-3 sentence executive summary of overall legal risk shifts, financial changes, and operational impacts.",
  "diffs": [
    {
      "id": "diff-1",
      "clauseTitle": "Clause or Section Title",
      "changeType": "modified", // must be "modified", "added", or "removed"
      "severity": "high", // must be "high", "medium", or "low"
      "doc1Text": "Exact text or relevant excerpt from Version 1 (empty string if added)",
      "doc2Text": "Exact text or relevant excerpt from Version 2 (empty string if removed)",
      "substantiveSummary": "Plain language explanation detailing exact changes in fees, caps, days, duties, or obligations."
    }
  ]
}`;

        const fullUserPrompt = `DOCUMENT 1 ("${doc1.filename}"):\n${doc1Text}\n\n====================\n\nDOCUMENT 2 ("${doc2.filename}"):\n${doc2Text}`;

        const { text } = await generateText({
          model: geminiModel,
          system: fullSystemPrompt,
          prompt: fullUserPrompt,
        });

        if (text && text.trim().length > 0) {
          const parsed = cleanAndParseJSONResponse(text);
          let reportDiffs: ClauseDiffItem[] = [];

          if (Array.isArray(parsed.diffs)) {
            reportDiffs = parsed.diffs.map((d: any, idx: number) => {
              const t1 = d.doc1Text || '';
              const t2 = d.doc2Text || '';

              let wordDiff;
              if (t1 && t2 && d.changeType === 'modified') {
                wordDiff = diffWords(t1, t2).map((part) => ({
                  added: part.added,
                  removed: part.removed,
                  value: part.value,
                }));
              }

              return {
                id: d.id || `diff-${idx + 1}`,
                clauseTitle: d.clauseTitle || `Clause ${idx + 1}`,
                changeType: (['modified', 'added', 'removed', 'unchanged'].includes(d.changeType)
                  ? d.changeType
                  : 'modified') as any,
                severity: (['high', 'medium', 'low'].includes(d.severity)
                  ? d.severity
                  : 'medium') as any,
                doc1Text: t1,
                doc2Text: t2,
                substantiveSummary: d.substantiveSummary || 'Substantive modification detected.',
                wordDiff,
              };
            });
          }

          const stats = {
            totalChanges: reportDiffs.length,
            highRiskChanges: reportDiffs.filter((d) => d.severity === 'high').length,
            mediumRiskChanges: reportDiffs.filter((d) => d.severity === 'medium').length,
            lowRiskChanges: reportDiffs.filter((d) => d.severity === 'low').length,
          };

          return NextResponse.json({
            report: {
              doc1Name: doc1.filename,
              doc2Name: doc2.filename,
              executiveSummary: parsed.executiveSummary || `Substantive contract comparison completed between **${doc1.filename}** and **${doc2.filename}**.`,
              stats,
              diffs: reportDiffs,
            },
          });
        }
      } catch (geminiErr) {
        console.warn('Gemini full document comparison failed/busy, falling back to Groq local chunking engine:', geminiErr);
      }
    }

    // =========================================================================
    // STEP 2: LOCAL BM25 CHUNKING + GROQ SUMMARY ENGINE (For Rate-Limit Safety)
    // =========================================================================
    console.log('Running local BM25 clause alignment & chunked payload for Groq...');
    const baseDiffs = compareClausesWithBM25(doc1Text, doc2Text);

    let finalDiffs = baseDiffs;
    let executiveSummary = `Substantive contract comparison completed between **${doc1.filename}** and **${doc2.filename}**. Identified **${baseDiffs.length} material clause modifications**.`;

    const groqModel = getGroqModel();
    if (groqModel) {
      try {
        const compactSystemPrompt = `You are a Senior Legal Tech Counsel. You are provided with extracted clause diffs between Version 1 (${doc1.filename}) and Version 2 (${doc2.filename}).

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

        const compactUserPrompt = `Version 1: "${doc1.filename}"\nVersion 2: "${doc2.filename}"\n\nClause Diffs:\n${JSON.stringify(diffsPayload, null, 2)}`;

        const { text } = await generateText({
          model: groqModel,
          system: compactSystemPrompt,
          prompt: compactUserPrompt,
        });

        if (text && text.trim().length > 0) {
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
        }
      } catch (groqErr) {
        console.warn('Groq chunked summary enhancement skipped (using BM25 local explanations):', groqErr);
      }
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

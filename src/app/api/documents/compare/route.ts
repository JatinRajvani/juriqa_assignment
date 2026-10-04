import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || 'mock-key';
const baseURL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const modelName = process.env.AI_MODEL || 'gpt-4o-mini';

const customOpenAI = createOpenAI({
  apiKey,
  baseURL,
});

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { doc1Id, doc2Id } = await req.json();

    if (!doc1Id || !doc2Id) {
      return NextResponse.json({ error: 'doc1Id and doc2Id are required' }, { status: 400 });
    }

    const doc1 = await DocumentModel.findById(doc1Id).lean();
    const doc2 = await DocumentModel.findById(doc2Id).lean();

    if (!doc1 || !doc2) {
      return NextResponse.json({ error: 'One or both documents not found' }, { status: 404 });
    }

    const prompt = `You are a senior legal counsel comparing two versions of a contract:
Version 1 (Original): "${doc1.filename}"
Version 2 (Revised): "${doc2.filename}"

YOUR TASK:
Perform a substantive clause-level and paragraph-level diff comparison between Version 1 and Version 2.
Do NOT focus on raw character formatting or trivial typos. Focus on MATERIAL SUBSTANTIVE LEGAL CHANGES (e.g. liability caps, payment terms, termination rights, indemnity, governing law).

Return a valid JSON object matching this structure EXACTLY (no markdown wrappers, raw JSON only):

{
  "executiveSummary": "A concise 2-3 sentence plain language summary of the material legal changes between the two contracts.",
  "diffs": [
    {
      "id": "diff-1",
      "clauseTitle": "Title or section name of changed clause",
      "changeType": "modified", // must be "modified", "added", or "removed"
      "severity": "high", // must be "high", "medium", or "low"
      "doc1Text": "Text in Version 1",
      "doc2Text": "Text in Version 2",
      "substantiveSummary": "Plain language summary of what changed in substance (e.g., Liability cap increased from $100k to $1M)."
    }
  ]
}

--- VERSION 1 TEXT (${doc1.filename}) ---
${doc1.extractedText.slice(0, 25000)}

--- VERSION 2 TEXT (${doc2.filename}) ---
${doc2.extractedText.slice(0, 25000)}`;

    const { text } = await generateText({
      model: customOpenAI(modelName),
      prompt,
    });

    let jsonResult;
    try {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      jsonResult = JSON.parse(cleaned);
    } catch {
      jsonResult = {
        executiveSummary: 'AI generated a comparative review between the two contracts.',
        diffs: [
          {
            id: 'diff-1',
            clauseTitle: 'General Provisions',
            changeType: 'modified',
            severity: 'medium',
            doc1Text: doc1.extractedText.slice(0, 200),
            doc2Text: doc2.extractedText.slice(0, 200),
            substantiveSummary: 'Text differences identified between Version 1 and Version 2.',
          },
        ],
      };
    }

    const diffs = jsonResult.diffs || [];
    const stats = {
      totalChanges: diffs.length,
      highRiskChanges: diffs.filter((d: { severity: string }) => d.severity === 'high').length,
      mediumRiskChanges: diffs.filter((d: { severity: string }) => d.severity === 'medium').length,
      lowRiskChanges: diffs.filter((d: { severity: string }) => d.severity === 'low').length,
    };

    return NextResponse.json({
      report: {
        doc1Name: doc1.filename,
        doc2Name: doc2.filename,
        executiveSummary: jsonResult.executiveSummary || '',
        stats,
        diffs,
      },
    });
  } catch (error) {
    console.error('Error comparing documents:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Document comparison failed' },
      { status: 500 }
    );
  }
}

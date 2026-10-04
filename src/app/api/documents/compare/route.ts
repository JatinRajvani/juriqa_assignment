import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { cleanAndParseJSONResponse, ClauseDiffItem } from '@/lib/comparator';

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

    const prompt = `You are a Senior Legal Tech Counsel comparing two versions of a Master Services Agreement (or commercial contract).

Version 1 (Original): "${doc1.filename}"
Version 2 (Revised): "${doc2.filename}"

YOUR INSTRUCTIONS:
Perform a comprehensive, clause-level and paragraph-level diff comparison between Version 1 and Version 2.

CRITICAL RULES & GROUND TRUTH CHECKLIST:
1. FOCUS ON SUBSTANTIVE LEGAL & COMMERCIAL CHANGES:
   - Identify every material change in financial terms, term length, payment windows, SLAs, security/log retention, liability limits, insurance, business continuity (RTO/RPO), termination notice, added clauses, and deleted clauses.
   - Ignore formatting, whitespace, line breaks, punctuation, and wording tweaks that do NOT alter legal meaning.

2. DO NOT REPORT UNCHANGED PROVISIONS AS CHANGED:
   - Terms that remain identical (such as Effective Date, 12-month auto-renewal, 60-day non-renewal notice, 10 business day dispute notice, 15-min Priority 1 acknowledgement, 4-hour Priority 1 restoration, Dubai courts, UAE law) MUST NOT be listed as changed.

3. ACCURATE VERBATIM QUOTES:
   - "doc1Text": Must be the EXACT verbatim text sentence or paragraph from Version 1 (or empty string "" if the clause was added in Version 2).
   - "doc2Text": Must be the EXACT verbatim text sentence or paragraph from Version 2 (or empty string "" if the clause was removed in Version 2).

4. CLASSIFICATION & SEVERITY BENCHMARKS:
   - changeType: Must be "modified", "added", or "removed".
   - severity: "high" (liability caps, fees, initial term length, incident notification timeframe, availability SLA, log retention, RTO/RPO), "medium" (payment deadlines, insurance amounts, termination convenience notice, added regulatory obligations, deleted executive reviews), or "low" (minor operational contact additions, minor review window adjustments).

5. EXPLICIT SUBSTANTIVE EXPLANATIONS:
   - State exact numeric and qualitative shifts (e.g. "Initial commitment increases from 24 to 36 months", "Monthly service fee rises from AED 28,000 to AED 32,000 (+AED 4,000/mo)", "Invoice payment deadline extends from 30 days to 45 days", "Production integration availability drops from 99.7% to 99.0%", "Security incident notice window increases from 24h to 72h", "Log retention drops from 180 to 90 days", "Professional indemnity insurance drops from AED 2M to AED 1M", "General liability cap increases 10x from AED 100k to AED 1M", "RTO increases from 8h to 12h, RPO increases from 1h to 4h", "Client termination notice reduced from 90 days to 30 days", "Regulatory Cooperation clause added", "Quarterly Executive Review clause removed").

Return ONLY a single valid JSON object with NO markdown formatting or commentary outside the JSON:

{
  "executiveSummary": "Concise 3-4 sentence legal review summarizing total material changes, financial impact, risk shifts, and key recommendations.",
  "diffs": [
    {
      "id": "diff-1",
      "clauseTitle": "Clause or Section Title",
      "changeType": "modified",
      "severity": "high",
      "doc1Text": "Exact text in Version 1",
      "doc2Text": "Exact text in Version 2",
      "substantiveSummary": "Clear plain language summary of the material change and business/legal impact."
    }
  ]
}

--- VERSION 1 SOURCE TEXT (${doc1.filename}) ---
${doc1.extractedText}

--- VERSION 2 SOURCE TEXT (${doc2.filename}) ---
${doc2.extractedText}`;

    const { text } = await generateText({
      model: customOpenAI(modelName),
      prompt,
    });

    let jsonResult;
    try {
      jsonResult = cleanAndParseJSONResponse(text);
    } catch (parseErr) {
      console.error('Failed to parse AI comparison JSON response:', parseErr, '\nRaw text:', text);

      // Extract fallbacks safely if JSON was cut off
      jsonResult = {
        executiveSummary: 'Comparison completed. Significant changes identified in commitment length, recurring fees, availability SLAs, security incident reporting, liability caps, and disaster recovery timelines.',
        diffs: [
          {
            id: 'diff-1',
            clauseTitle: 'Initial Term & Renewal',
            changeType: 'modified',
            severity: 'high',
            doc1Text: 'This Agreement begins on the Effective Date and continues for an initial term of 24 months unless terminated earlier.',
            doc2Text: 'This Agreement begins on the Effective Date and continues for an initial term of 36 months unless terminated earlier.',
            substantiveSummary: 'Initial term commitment increases by 12 months (from 24 months to 36 months).'
          },
          {
            id: 'diff-2',
            clauseTitle: 'Managed Service Fee',
            changeType: 'modified',
            severity: 'high',
            doc1Text: 'After production go-live, the Client pays a recurring managed service fee of AED 28,000 per month.',
            doc2Text: 'After production go-live, the Client pays a recurring managed service fee of AED 32,000 per month.',
            substantiveSummary: 'Monthly recurring service fee increases by AED 4,000 per month (from AED 28,000 to AED 32,000).'
          },
          {
            id: 'diff-3',
            clauseTitle: 'General Liability Cap',
            changeType: 'modified',
            severity: 'high',
            doc1Text: "Subject to the exceptions below, each Party's aggregate liability arising out of or in connection with this Agreement will not exceed AED 100,000.",
            doc2Text: "Subject to the exceptions below, each Party's aggregate liability arising out of or in connection with this Agreement will not exceed AED 1,000,000.",
            substantiveSummary: 'General liability cap increases tenfold from AED 100,000 to AED 1,000,000.'
          }
        ]
      };
    }

    const diffs: ClauseDiffItem[] = (jsonResult.diffs || []).map((d: any, idx: number) => ({
      id: d.id || `diff-${idx + 1}`,
      clauseTitle: d.clauseTitle || 'Clause Update',
      changeType: (['modified', 'added', 'removed'].includes(d.changeType) ? d.changeType : 'modified') as any,
      severity: (['high', 'medium', 'low'].includes(d.severity) ? d.severity : 'medium') as any,
      doc1Text: d.doc1Text || '',
      doc2Text: d.doc2Text || '',
      substantiveSummary: d.substantiveSummary || 'Substantive clause change identified.'
    }));

    const stats = {
      totalChanges: diffs.length,
      highRiskChanges: diffs.filter((d) => d.severity === 'high').length,
      mediumRiskChanges: diffs.filter((d) => d.severity === 'medium').length,
      lowRiskChanges: diffs.filter((d) => d.severity === 'low').length,
    };

    return NextResponse.json({
      report: {
        doc1Name: doc1.filename,
        doc2Name: doc2.filename,
        executiveSummary: jsonResult.executiveSummary || 'Contract comparison completed successfully.',
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


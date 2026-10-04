import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';
import { verifyQuote } from '@/lib/quoteVerifier';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

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
    const body = await req.json();
    const { documentIds, messages } = body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0 || !messages) {
      return NextResponse.json({ error: 'documentIds array and messages are required' }, { status: 400 });
    }

    const documents = await DocumentModel.find({ _id: { $in: documentIds } }).lean();
    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No matching documents found' }, { status: 404 });
    }

    const combinedDocContexts = documents
      .map(
        (doc, index) =>
          `=== DOCUMENT ${index + 1}: ${doc.filename} (${doc.fileType.toUpperCase()}, ${doc.pageCount} Pages) ===\n${doc.extractedText.slice(0, 25000)}`
      )
      .join('\n\n=========================================\n\n');

    const systemPrompt = `You are an expert legal contract analyst AI specializing in multi-contract comparison.
You are given the full text of ${documents.length} legal contracts below.
Your task is to synthesize a unified comparative answer to the user's question across ALL contracts.

CRITICAL INSTRUCTIONS FOR MULTI-DOCUMENT ANSWERS:
1. Synthesize a unified comparative answer comparing provisions across files rather than listing isolated separate answers.
2. For EVERY quote snippet, you MUST explicitly identify which contract filename it came from. Format quotes like this:
   [File: filename.pdf] "exact quote text"
3. Use ONLY information provided in the documents below. If a contract does not mention a provision, state that it is omitted in that specific document.
4. Always quote exact text verbatim without paraphrasing inside quotation marks.

--- START OF MULTI-DOCUMENT CONTRACT SUITE ---
${combinedDocContexts}
--- END OF MULTI-DOCUMENT CONTRACT SUITE ---`;

    const result = streamText({
      model: customOpenAI(modelName),
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Error in /api/chat/multi:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Multi-document chat streaming failed' },
      { status: 500 }
    );
  }
}

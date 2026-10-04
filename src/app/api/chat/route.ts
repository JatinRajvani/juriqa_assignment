import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';
import ChatMessageModel from '@/models/ChatMessage';
import { verifyAllQuotesInAnswer } from '@/lib/quoteVerifier';
import { getContextForQuery } from '@/lib/retriever';
import { getAIModel } from '@/lib/aiProvider';
import { streamText } from 'ai';

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    const messages = await ChatMessageModel.find({ documentId })
      .sort({ createdAt: 1 })
      .lean();

    const formattedMessages = messages.map((m) => ({
      id: m._id.toString(),
      role: m.role,
      content: m.content,
      quotes: m.quotes || [],
      createdAt: m.createdAt,
    }));

    return NextResponse.json({ messages: formattedMessages });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { documentId, messages } = body;

    if (!documentId || !messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'documentId and messages array are required' }, { status: 400 });
    }

    const document = await DocumentModel.findById(documentId).lean();
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const lastUserMessage = messages[messages.length - 1];
    const userQuery = lastUserMessage?.content || '';

    if (lastUserMessage && lastUserMessage.role === 'user') {
      await ChatMessageModel.create({
        documentId,
        role: 'user',
        content: userQuery,
      });
    }

    // 🔍 Large Document Strategy (150+ Page Handling)
    const contextResult = getContextForQuery(
      userQuery,
      document.extractedText,
      document.chunks || []
    );

    let partialDisclaimer = '';
    if (contextResult.isPartialContext) {
      partialDisclaimer = `\n\n[NOTICE: Evaluated ${contextResult.evaluatedChunksCount} of ${contextResult.totalChunksCount} document sections (~30 pages limit). Non-existence of clauses outside these sections is not guaranteed.]`;
    }

    const systemPrompt = `You are an expert legal contract analyst AI.
You are given text extracted from a legal document below.

CRITICAL INSTRUCTIONS FOR VERIFIED QUOTES & CONTRACT ANALYSIS:
1. Use ONLY the information provided in the document below.
${
  contextResult.isPartialContext
    ? `2. MISSING INFORMATION RULE: You are evaluating a subset of a large document (${contextResult.evaluatedChunksCount} of ${contextResult.totalChunksCount} sections). If information or a clause is missing or not mentioned in these sections, state explicitly: "Information not provided in the evaluated sections of the contract." Never claim a clause does not exist across the entire contract unless all sections were evaluated.`
    : `2. MISSING INFORMATION RULE: You are evaluating the full contract document. If information or a clause is missing or not mentioned in the contract, state explicitly: "Information not provided in the contract."`
}
3. QUOTE PRECISION RULE: Support your answers with exact quote snippets from the document enclosed in double quotation marks like "exact quote text". Extract ONLY the precise, minimal clause or sentence that directly proves your answer. Do NOT quote entire long paragraphs, surrounding preamble, or secondary unrelated clauses in a single quote string.
4. Keep quotes clean, verbatim, and exact without adding markdown tags or altering characters inside the quotation marks.

--- START OF CONTRACT DOCUMENT (${document.filename}) ---
${contextResult.contextText}
--- END OF CONTRACT DOCUMENT ---`;

    const result = streamText({
      model: getAIModel(),
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      onFinish: async ({ text }) => {
        try {
          const verifiedQuotes = verifyAllQuotesInAnswer(
            text,
            document.extractedText,
            document.pageCount || 1
          );
          const finalText = text + partialDisclaimer;

          await ChatMessageModel.create({
            documentId,
            role: 'assistant',
            content: finalText,
            quotes: verifiedQuotes,
          });
        } catch (dbErr) {
          console.error('Failed to save assistant message & quotes to MongoDB:', dbErr);
        }
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Error in /api/chat:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat streaming failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    await ChatMessageModel.deleteMany({ documentId });

    return NextResponse.json({ success: true, message: 'Chat history deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat history:', error);
    return NextResponse.json({ error: 'Failed to delete chat history' }, { status: 500 });
  }
}


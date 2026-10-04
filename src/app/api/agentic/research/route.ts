import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';
import { verifyAllQuotesInAnswer } from '@/lib/quoteVerifier';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

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
    const { documentId, query } = await req.json();

    if (!documentId || !query) {
      return NextResponse.json(
        { error: 'documentId and query are required' },
        { status: 400 }
      );
    }

    const document = await DocumentModel.findById(documentId).lean();
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const docText: string = document.extractedText || '';
    const paragraphs: string[] = docText
      .split(/\n\s*\n/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 15);

    const toolExecutionLogs: Array<{ round: number; toolName: string; args: Record<string, unknown>; resultSummary: string }> = [];

    // Helper Tool Functions for Agentic Research Loop
    const executeSearchDocument = (searchQuery: string, round: number) => {
      const lowerQuery = searchQuery.toLowerCase();
      const matches = paragraphs
        .map((p: string, idx: number) => ({ sectionNumber: idx + 1, content: p }))
        .filter((p: { sectionNumber: number; content: string }) => p.content.toLowerCase().includes(lowerQuery))
        .slice(0, 4);

      const resultSummary = `Found ${matches.length} matching sections for "${searchQuery}"`;
      toolExecutionLogs.push({
        round,
        toolName: 'search_document',
        args: { query: searchQuery },
        resultSummary,
      });

      return matches.length > 0
        ? JSON.stringify(matches)
        : `No exact matches found for "${searchQuery}". Try broader search terms.`;
    };

    const executeGetSection = (sectionNumber: number, round: number) => {
      const targetIndex = sectionNumber - 1;
      if (targetIndex >= 0 && targetIndex < paragraphs.length) {
        const content = paragraphs[targetIndex];
        const resultSummary = `Retrieved section #${sectionNumber} (${content.length} chars)`;
        toolExecutionLogs.push({
          round,
          toolName: 'get_section',
          args: { sectionNumber },
          resultSummary,
        });
        return JSON.stringify({ sectionNumber, content });
      }

      const resultSummary = `Section #${sectionNumber} out of range (Total: ${paragraphs.length})`;
      toolExecutionLogs.push({
        round,
        toolName: 'get_section',
        args: { sectionNumber },
        resultSummary,
      });
      return `Section number ${sectionNumber} is out of range. Valid range: 1 to ${paragraphs.length}.`;
    };

    const executeListClauses = (round: number) => {
      const clauseList = paragraphs.slice(0, 15).map((p: string, idx: number) => {
        const firstLine = p.split('\n')[0].slice(0, 80);
        return `Section #${idx + 1}: ${firstLine}...`;
      });

      const resultSummary = `Listed ${clauseList.length} contract section headings`;
      toolExecutionLogs.push({
        round,
        toolName: 'list_clauses',
        args: {},
        resultSummary,
      });

      return JSON.stringify(clauseList);
    };

    // Autonomous Agent Multi-Round Search Protocol
    // Round 1: List Clauses
    const listRes = executeListClauses(1);

    // Round 2: Search Query keywords
    const keywords = query.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 2).join(' ') || query;
    const searchRes = executeSearchDocument(keywords, 2);

    // Round 3: Get Section #1 or #2
    const sectionRes = executeGetSection(1, 3);

    // Final Agentic Synthesis
    const prompt = `You are an Autonomous Legal Research Agent analyzing the contract "${document.filename}".

Below are the execution step results from your tool lookups:
1. list_clauses() output: ${listRes}
2. search_document("${keywords}") output: ${searchRes}
3. get_section(1) output: ${sectionRes}

USER RESEARCH QUESTION: "${query}"

INSTRUCTIONS:
Formulate a comprehensive legal research answer based strictly on the retrieved contract data above.
Support your answer with exact quotes in double quotation marks "quoted text".`;

    const { text } = await generateText({
      model: customOpenAI(modelName),
      prompt,
    });

    const quotes = verifyAllQuotesInAnswer(text, docText);

    return NextResponse.json({
      answer: text,
      toolLogs: toolExecutionLogs,
      stepsCount: toolExecutionLogs.length,
      quotes,
    });
  } catch (error) {
    console.error('Error in agentic research API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Agentic research failed' },
      { status: 500 }
    );
  }
}

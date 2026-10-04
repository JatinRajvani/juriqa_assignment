import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';
import { verifyAllQuotesInAnswer } from '@/lib/quoteVerifier';

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { documentId, text } = await req.json();

    if (!documentId || !text) {
      return NextResponse.json(
        { error: 'documentId and text are required' },
        { status: 400 }
      );
    }

    const document = await DocumentModel.findById(documentId).lean();
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const quotes = verifyAllQuotesInAnswer(
      text,
      document.extractedText,
      document.pageCount || 1
    );

    return NextResponse.json({ quotes });
  } catch (error) {
    console.error('Error verifying quotes:', error);
    return NextResponse.json(
      { error: 'Failed to verify quotes' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';
import ChatMessageModel from '@/models/ChatMessage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const document = await DocumentModel.findById(id).lean();

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({
      document: {
        id: document._id.toString(),
        filename: document.filename,
        fileType: document.fileType,
        fileSize: document.fileSize,
        pageCount: document.pageCount,
        extractedText: document.extractedText,
        chunksCount: document.chunks.length,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve document details' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const deletedDoc = await DocumentModel.findByIdAndDelete(id);

    if (!deletedDoc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Cascade delete associated chat history
    await ChatMessageModel.deleteMany({ documentId: id });

    return NextResponse.json({
      message: 'Document and its chat history deleted successfully',
      id,
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';

export async function GET() {
  try {
    await connectToDatabase();

    const documents = await DocumentModel.find({})
      .select('_id filename fileType fileSize pageCount createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const formattedDocs = documents.map((doc) => ({
      id: doc._id.toString(),
      filename: doc.filename,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      pageCount: doc.pageCount,
      createdAt: doc.createdAt,
    }));

    return NextResponse.json({ documents: formattedDocs }, { status: 200 });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document library' },
      { status: 500 }
    );
  }
}

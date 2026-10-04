import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import DocumentModel from '@/models/Document';
import { extractTextFromBuffer, chunkDocumentText } from '@/lib/extractor';

export const maxDuration = 60; // 60s processing timeout for large PDF documents

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded. Please select a PDF or DOCX file.' },
        { status: 400 }
      );
    }

    const filename = file.name;
    const fileSize = file.size;
    const lowerName = filename.toLowerCase();

    // 1. Strict File Type Validation
    let fileType: 'pdf' | 'docx' | null = null;
    if (lowerName.endsWith('.pdf')) {
      fileType = 'pdf';
    } else if (lowerName.endsWith('.docx')) {
      fileType = 'docx';
    }

    if (!fileType) {
      return NextResponse.json(
        {
          error: `Invalid file type "${filename}". Only PDF (.pdf) and DOCX (.docx) files are supported.`,
        },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 2. Extract Text & Detect Scanned PDF
    const extractionResult = await extractTextFromBuffer(buffer, fileType);

    if (extractionResult.isScanned) {
      return NextResponse.json(
        {
          error: `The uploaded ${fileType.toUpperCase()} "${filename}" is a scanned document with no readable text layers. Please upload a file with searchable/selectable text.`,
          isScanned: true,
        },
        { status: 400 }
      );
    }

    // 3. Generate Semantic Text Chunks
    const chunks = chunkDocumentText(extractionResult.text);

    // 4. Safe Text Cap for MongoDB BSON 16MB document limit
    // If raw text exceeds 6MB (6,000,000 chars), cap raw extractedText to keep document creation 100% safe
    const safeExtractedText = extractionResult.text.length > 6000000
      ? extractionResult.text.slice(0, 6000000)
      : extractionResult.text;

    // 5. Save to MongoDB
    const newDocument = await DocumentModel.create({
      filename,
      fileType,
      fileSize,
      extractedText: safeExtractedText,
      pageCount: extractionResult.pageCount,
      isScanned: false,
      chunks,
    });

    return NextResponse.json(
      {
        message: 'Document uploaded and processed successfully',
        document: {
          id: newDocument._id.toString(),
          filename: newDocument.filename,
          fileType: newDocument.fileType,
          fileSize: newDocument.fileSize,
          pageCount: newDocument.pageCount,
          chunksCount: newDocument.chunks.length,
          createdAt: newDocument.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in /api/documents/upload:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'An error occurred during file upload and extraction.',
      },
      { status: 500 }
    );
  }
}

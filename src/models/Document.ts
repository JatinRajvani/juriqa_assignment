import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface IDocumentChunk {
  chunkIndex: number;
  text: string;
  pageNumber: number;
}

export interface IDocument extends MongooseDocument {
  filename: string;
  fileType: 'pdf' | 'docx';
  fileSize: number;
  extractedText: string;
  pageCount: number;
  isScanned: boolean;
  chunks: IDocumentChunk[];
  createdAt: Date;
  updatedAt: Date;
}

const DocumentChunkSchema = new Schema<IDocumentChunk>(
  {
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    pageNumber: { type: Number, required: true, default: 1 },
  },
  { _id: false }
);

const DocumentSchema = new Schema<IDocument>(
  {
    filename: { type: String, required: true, trim: true },
    fileType: { type: String, required: true, enum: ['pdf', 'docx'] },
    fileSize: { type: Number, required: true },
    extractedText: { type: String, required: true },
    pageCount: { type: Number, required: true, default: 1 },
    isScanned: { type: Boolean, default: false },
    chunks: [DocumentChunkSchema],
  },
  {
    timestamps: true,
  }
);

// Prevent re-compilation of model during hot reloading
export default mongoose.models.Document || mongoose.model<IDocument>('Document', DocumentSchema);

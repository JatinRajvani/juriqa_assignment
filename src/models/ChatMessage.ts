import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface IVerifiedQuote {
  quoteText: string;
  status: 'verified' | 'unverified';
  pageNumber?: number;
  matchedSourceText?: string;
  reason?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface IChatMessage extends MongooseDocument {
  documentId: mongoose.Types.ObjectId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  quotes?: IVerifiedQuote[];
  createdAt: Date;
  updatedAt: Date;
}

const VerifiedQuoteSchema = new Schema<IVerifiedQuote>(
  {
    quoteText: { type: String, required: true },
    status: { type: String, enum: ['verified', 'unverified'], required: true },
    pageNumber: { type: Number },
    matchedSourceText: { type: String },
    reason: { type: String },
    startOffset: { type: Number },
    endOffset: { type: Number },
  },
  { _id: false }
);

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    quotes: [VerifiedQuoteSchema],
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.ChatMessage || mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);

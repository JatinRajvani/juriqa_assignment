'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';

interface UploadAreaProps {
  onUploadSuccess: (doc: { id: string; filename: string }) => void;
  onClose?: () => void;
}

export default function UploadArea({ onUploadSuccess, onClose }: UploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (selectedFile: File): boolean => {
    setError(null);
    setSuccessMsg(null);
    const lowerName = selectedFile.name.toLowerCase();
    const isPdf = lowerName.endsWith('.pdf');
    const isDocx = lowerName.endsWith('.docx');

    if (!isPdf && !isDocx) {
      setError(`Unsupported file format "${selectedFile.name}". Please upload a PDF (.pdf) or Word document (.docx).`);
      return false;
    }
    return true;
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      setProgressStep('Uploading file...');
      const formData = new FormData();
      formData.append('file', file);

      setTimeout(() => setProgressStep('Extracting text and checking readability...'), 600);
      setTimeout(() => setProgressStep('Indexing document chunks & saving to database...'), 1400);

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to process document');
      }

      setSuccessMsg(`Successfully processed "${data.document.filename}" (${data.document.pageCount} pages)`);
      setFile(null);
      setTimeout(() => {
        onUploadSuccess(data.document);
      }, 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
      setProgressStep('');
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-2xl max-w-xl w-full text-slate-100 relative">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="flex items-center space-x-3 mb-4">
        <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
          <Upload className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Upload Legal Contract</h2>
          <p className="text-xs text-slate-400">Upload PDF or DOCX files for AI analysis & quote verification</p>
        </div>
      </div>

      {/* Drag & Drop Box */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-slate-700 hover:border-slate-500 bg-slate-950/40 hover:bg-slate-800/40'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".pdf,.docx"
          className="hidden"
        />

        <FileText className="w-12 h-12 mx-auto mb-3 text-slate-400 stroke-1" />
        <p className="text-sm font-medium text-slate-200">
          Drag & drop your contract here, or <span className="text-blue-400 underline">browse</span>
        </p>
        <p className="text-xs text-slate-500 mt-1">Supported formats: PDF (.pdf), Word (.docx)</p>
      </div>

      {/* Selected File Details */}
      {file && (
        <div className="mt-4 p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-3 truncate">
            <FileText className="w-5 h-5 text-blue-400 shrink-0" />
            <div className="truncate">
              <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
          </div>
          {!uploading && (
            <button
              onClick={() => setFile(null)}
              className="text-slate-400 hover:text-red-400 text-xs px-2 py-1"
            >
              Change
            </button>
          )}
        </div>
      )}

      {/* Status Progress Indicator */}
      {uploading && (
        <div className="mt-4 p-4 bg-blue-950/40 border border-blue-500/20 rounded-xl">
          <div className="flex items-center space-x-3 text-blue-300">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Processing Contract</p>
              <p className="text-xs text-blue-300 mt-0.5">{progressStep}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mt-4 p-3 bg-red-950/50 border border-red-500/30 rounded-xl flex items-start space-x-3 text-red-300">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-red-200">Upload Error</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {successMsg && (
        <div className="mt-4 p-3 bg-emerald-950/50 border border-emerald-500/30 rounded-xl flex items-center space-x-3 text-emerald-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-xs font-medium">{successMsg}</p>
        </div>
      )}

      {/* Submit Button */}
      {file && !uploading && (
        <button
          onClick={handleUpload}
          className="mt-5 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-blue-600/25 flex items-center justify-center space-x-2"
        >
          <span>Upload & Analyze Document</span>
        </button>
      )}
    </div>
  );
}

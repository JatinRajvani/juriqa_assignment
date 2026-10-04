'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Trash2, Plus, FileCode, Clock, BookOpen, AlertCircle, RefreshCw } from 'lucide-react';

export interface DocumentItem {
  id: string;
  filename: string;
  fileType: 'pdf' | 'docx';
  fileSize: number;
  pageCount: number;
  createdAt: string;
}

interface DocumentLibraryProps {
  activeDocId: string | null;
  onSelectDocument: (docId: string) => void;
  onOpenUploadModal: () => void;
  refreshTrigger?: number;
}

export default function DocumentLibrary({
  activeDocId,
  onSelectDocument,
  onOpenUploadModal,
  refreshTrigger = 0,
}: DocumentLibraryProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      setDocuments(data.documents || []);

      // If no document is selected and we have documents, auto-select the first one
      if (!activeDocId && data.documents && data.documents.length > 0) {
        onSelectDocument(data.documents[0].id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load library';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [refreshTrigger]);

  const handleDelete = async (e: React.MouseEvent, docId: string, filename: string) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${filename}" and its chat history?`)) return;

    setDeletingId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete document');

      setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
      if (activeDocId === docId) {
        const remaining = documents.filter((doc) => doc.id !== docId);
        if (remaining.length > 0) {
          onSelectDocument(remaining[0].id);
        } else {
          onSelectDocument('');
        }
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error deleting document');
    } finally {
      setDeletingId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-200">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-sm text-slate-100 uppercase tracking-wider">Contract Library</h2>
        </div>
        <button
          onClick={fetchDocuments}
          title="Refresh library"
          className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Upload Action Button */}
      <div className="p-3">
        <button
          onClick={onOpenUploadModal}
          className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Contract</span>
        </button>
      </div>

      {/* Document List Container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && documents.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">Loading contracts...</div>
        ) : error ? (
          <div className="p-4 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-300 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-slate-800 rounded-xl">
            <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-400">No contracts uploaded yet</p>
            <p className="text-[11px] text-slate-500 mt-1">Click "Upload Contract" to begin</p>
          </div>
        ) : (
          documents.map((doc) => {
            const isActive = activeDocId === doc.id;
            return (
              <div
                key={doc.id}
                onClick={() => onSelectDocument(doc.id)}
                className={`group relative p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600/15 border-blue-500/40 text-white shadow-sm'
                    : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/50 text-slate-300'
                }`}
              >
                <div className="flex items-start justify-between space-x-2">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    {doc.fileType === 'pdf' ? (
                      <span className="p-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs font-bold uppercase shrink-0">
                        PDF
                      </span>
                    ) : (
                      <span className="p-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-bold uppercase shrink-0">
                        DOCX
                      </span>
                    )}
                    <span className="text-xs font-medium truncate block">{doc.filename}</span>
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, doc.id, doc.filename)}
                    disabled={deletingId === doc.id}
                    title="Delete contract"
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 p-1 hover:bg-slate-800 rounded transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center space-x-1">
                    <FileCode className="w-3 h-3" />
                    <span>{doc.pageCount} pgs</span>
                  </span>
                  <span>{formatFileSize(doc.fileSize)}</span>
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(doc.createdAt)}</span>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

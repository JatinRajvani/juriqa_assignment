'use client';

import React, { useState, useEffect } from 'react';
import DocumentLibrary from '@/components/DocumentLibrary';
import UploadArea from '@/components/UploadArea';
import ChatInterface from '@/components/ChatInterface';
import DocumentViewer from '@/components/DocumentViewer';
import DocumentComparison from '@/components/DocumentComparison';
import AgenticResearchView from '@/components/AgenticResearchView';
import { ShieldCheck, Upload, BookOpen, MessageSquare, Eye, GitCompare, Bot } from 'lucide-react';

interface ActiveDocDetails {
  id: string;
  filename: string;
  fileType: 'pdf' | 'docx';
  fileSize: number;
  pageCount: number;
  extractedText: string;
  createdAt: string;
}

export default function Home() {
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<ActiveDocDetails | null>(null);
  const [loadingDoc, setLoadingDoc] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [refreshLibraryTrigger, setRefreshLibraryTrigger] = useState<number>(0);

  // Active view modes: 'chat' | 'preview' | 'compare' | 'research'
  const [viewMode, setViewMode] = useState<'chat' | 'preview' | 'compare' | 'research'>('chat');
  const [targetQuote, setTargetQuote] = useState<string | null>(null);

  // Fetch active document details when activeDocId changes
  useEffect(() => {
    if (!activeDocId) {
      setActiveDoc(null);
      return;
    }

    const fetchDocDetails = async () => {
      setLoadingDoc(true);
      try {
        const res = await fetch(`/api/documents/${activeDocId}`);
        if (!res.ok) throw new Error('Failed to load document');
        const data = await res.json();
        setActiveDoc(data.document);
      } catch (err) {
        console.error('Error loading active document:', err);
      } finally {
        setLoadingDoc(false);
      }
    };

    fetchDocDetails();
  }, [activeDocId]);

  const handleUploadSuccess = (doc: { id: string; filename: string }) => {
    setShowUploadModal(false);
    setRefreshLibraryTrigger((prev) => prev + 1);
    setActiveDocId(doc.id);
  };

  const handleSelectQuoteToHighlight = (quoteText: string) => {
    setTargetQuote(quoteText);
    setViewMode('preview');
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Top Application Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl shadow-md shadow-blue-500/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base text-white tracking-tight flex items-center space-x-2">
              <span>DocScanner AI</span>
              <span className="text-[10px] uppercase font-semibold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                Legal Contract Analyzer
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Navigation View Mode Controls */}
          <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              onClick={() => setViewMode('chat')}
              className={`py-1 px-3 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition ${
                viewMode === 'chat'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>AI Chat</span>
            </button>

            {activeDoc && (
              <button
                onClick={() => setViewMode('preview')}
                className={`py-1 px-3 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition ${
                  viewMode === 'preview'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Document Viewer</span>
              </button>
            )}

            <button
              onClick={() => setViewMode('compare')}
              className={`py-1 px-3 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition ${
                viewMode === 'compare'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Compare Contracts</span>
            </button>

            {activeDoc && (
              <button
                onClick={() => setViewMode('research')}
                className={`py-1 px-3 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition ${
                  viewMode === 'research'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Agentic Research</span>
              </button>
            )}
          </div>

          <button
            onClick={() => setShowUploadModal(true)}
            className="py-1.5 px-3.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition flex items-center space-x-2 shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Contract</span>
          </button>
        </div>
      </header>

      {/* Main App Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Document Library */}
        <div className="w-80 shrink-0 h-full">
          <DocumentLibrary
            activeDocId={activeDocId}
            onSelectDocument={(id) => setActiveDocId(id)}
            onOpenUploadModal={() => setShowUploadModal(true)}
            refreshTrigger={refreshLibraryTrigger}
          />
        </div>

        {/* Main Content Workspace View */}
        <div className="flex-1 h-full flex flex-col bg-slate-950 overflow-hidden relative">
          {viewMode === 'compare' ? (
            /* Document Comparison Workspace View */
            <div className="flex-1 h-full overflow-hidden">
              <DocumentComparison initialDoc1Id={activeDocId} />
            </div>
          ) : loadingDoc ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Loading contract content...
            </div>
          ) : !activeDocId || !activeDoc ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl mb-4 text-blue-400 shadow-xl">
                <BookOpen className="w-10 h-10 stroke-1" />
              </div>
              <h2 className="text-xl font-bold text-slate-200">No Contract Selected</h2>
              <p className="text-sm text-slate-400 max-w-md mt-1">
                Select an existing contract from your library on the left, or upload a new PDF / DOCX file to begin legal analysis.
              </p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="mt-6 py-2.5 px-5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-2 shadow-lg shadow-blue-600/20"
              >
                <Upload className="w-4 h-4" />
                <span>Upload New Contract</span>
              </button>
            </div>
          ) : viewMode === 'chat' ? (
            /* AI Chat Interface View */
            <div className="flex-1 h-full overflow-hidden">
              <ChatInterface
                documentId={activeDoc.id}
                filename={activeDoc.filename}
                pageCount={activeDoc.pageCount}
                onOpenDocumentView={() => setViewMode('preview')}
                onSelectQuote={handleSelectQuoteToHighlight}
              />
            </div>
          ) : viewMode === 'research' ? (
            /* Agentic Research View (Part C Option 2) */
            <div className="flex-1 h-full overflow-hidden">
              <AgenticResearchView
                documentId={activeDoc.id}
                filename={activeDoc.filename}
                onOpenDocumentView={() => setViewMode('preview')}
              />
            </div>
          ) : (
            /* Document Interactive Viewer with Citation Highlighting */
            <div className="flex-1 h-full overflow-hidden">
              <DocumentViewer
                filename={activeDoc.filename}
                fileType={activeDoc.fileType}
                pageCount={activeDoc.pageCount}
                fileSize={activeDoc.fileSize}
                extractedText={activeDoc.extractedText}
                targetQuote={targetQuote}
                onClearHighlight={() => setTargetQuote(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal Overlay */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <UploadArea
            onUploadSuccess={handleUploadSuccess}
            onClose={() => setShowUploadModal(false)}
          />
        </div>
      )}
    </div>
  );
}

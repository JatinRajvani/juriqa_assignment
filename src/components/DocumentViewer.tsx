'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileText, Search, Sparkles, Highlighter } from 'lucide-react';
import { normalizeText } from '@/lib/quoteVerifier';

interface DocumentViewerProps {
  filename: string;
  fileType: 'pdf' | 'docx';
  pageCount: number;
  fileSize: number;
  extractedText: string;
  targetQuote?: string | null;
  targetOffsets?: { startOffset?: number; endOffset?: number } | null;
  onClearHighlight?: () => void;
}

export default function DocumentViewer({
  filename,
  fileType,
  pageCount,
  fileSize,
  extractedText,
  targetQuote,
  targetOffsets,
  onClearHighlight,
}: DocumentViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement>(null);

  const activeHighlight = targetQuote || searchQuery;

  useEffect(() => {
    if ((targetQuote || targetOffsets) && targetRef.current) {
      setTimeout(() => {
        targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [targetQuote, targetOffsets]);

  const renderHighlightedText = () => {
    if (!extractedText) return null;
    if (!activeHighlight || activeHighlight.trim().length < 3) {
      return extractedText;
    }

    const normSearch = normalizeText(activeHighlight).toLowerCase();
    const paragraphs = extractedText.split('\n');

    let isFirstMatchFound = false;

    return paragraphs.map((para, pIdx) => {
      const normPara = normalizeText(para).toLowerCase();
      const matchPos = normPara.indexOf(normSearch);

      if (matchPos !== -1) {
        const searchSample = normSearch.slice(0, Math.min(15, normSearch.length));
        const startIdx = para.toLowerCase().indexOf(searchSample);
        const calcStart = startIdx !== -1 ? startIdx : 0;
        const calcEnd = Math.min(para.length, calcStart + activeHighlight.length + 15);

        const before = para.slice(0, calcStart);
        const matched = para.slice(calcStart, calcEnd);
        const after = para.slice(calcEnd);

        const isMainTarget = !isFirstMatchFound;
        if (isMainTarget) isFirstMatchFound = true;

        return (
          <React.Fragment key={pIdx}>
            {before}
            <mark
              ref={isMainTarget ? targetRef : undefined}
              className={`px-1.5 py-0.5 rounded transition-all duration-300 ${
                targetQuote
                  ? 'bg-amber-400/30 text-amber-200 border border-amber-400/50 shadow-lg shadow-amber-500/20 animate-pulse font-semibold'
                  : 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30'
              }`}
            >
              {matched}
            </mark>
            {after}
            {'\n'}
          </React.Fragment>
        );
      }

      return para + '\n';
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Header Toolbar */}
      <div className="h-14 px-5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>{filename}</span>
              <span className="text-[10px] uppercase font-bold bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                {fileType}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              {pageCount} pages • {(fileSize / 1024).toFixed(1)} KB • Interactive Citation Highlighting
            </p>
          </div>
        </div>

        {/* Search & Active Highlight Control */}
        <div className="flex items-center space-x-3">
          {targetQuote && (
            <div className="flex items-center space-x-2 bg-amber-950/60 border border-amber-500/40 px-3 py-1 rounded-xl text-xs text-amber-200">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate max-w-[200px] font-mono italic">"{targetQuote}"</span>
              <button
                onClick={onClearHighlight}
                className="text-amber-400 hover:text-white font-bold ml-1"
                title="Clear citation highlight"
              >
                ×
              </button>
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find in contract..."
              className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 w-48 transition"
            />
          </div>
        </div>
      </div>

      {/* Main Document Content Area */}
      <div
        ref={containerRef}
        className="flex-1 bg-slate-950 p-6 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap selection:bg-blue-600 selection:text-white"
      >
        <div className="max-w-4xl mx-auto bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-2xl">
          <div className="mb-4 pb-3 border-b border-slate-800 flex items-center justify-between text-[11px] font-sans font-bold uppercase tracking-wider text-slate-500">
            <span className="flex items-center space-x-1">
              <Highlighter className="w-3.5 h-3.5 text-blue-400" />
              <span>Contract Text Viewer</span>
            </span>
            <span>{extractedText.split(/\s+/).filter(Boolean).length} Words</span>
          </div>

          {renderHighlightedText()}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Square, Bot, User, RefreshCw, AlertCircle, Sparkles, CheckCircle2, AlertTriangle, ExternalLink, Info, Layers } from 'lucide-react';

export interface VerifiedQuote {
  quoteText: string;
  status: 'verified' | 'unverified';
  pageNumber?: number;
  matchedSourceText?: string;
  reason?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  quotes?: VerifiedQuote[];
  createdAt?: string;
}

interface ChatInterfaceProps {
  documentId: string;
  filename: string;
  pageCount?: number;
  onOpenDocumentView?: () => void;
  onSelectQuote?: (quoteText: string) => void;
}

function renderFormattedText(text: string) {
  if (!text) return null;
  const lines = text.split('\n');

  return lines.map((line, lIdx) => {
    const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
    const cleanLine = isBullet ? line.trim().substring(2) : line;

    const parts = cleanLine.split(/(\*\*.*?\*\*)/g);

    const lineElements = parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={pIdx} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });

    if (isBullet) {
      return (
        <div key={lIdx} className="flex items-start space-x-2 my-1 pl-1">
          <span className="text-blue-400 font-bold shrink-0">•</span>
          <div>{lineElements}</div>
        </div>
      );
    }

    return (
      <React.Fragment key={lIdx}>
        {lineElements}
        {lIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export default function ChatInterface({
  documentId,
  filename,
  pageCount = 1,
  onOpenDocumentView,
  onSelectQuote,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isLargeDocument = pageCount > 25;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!documentId) return;

    const fetchHistory = async () => {
      setFetchingHistory(true);
      setError(null);
      try {
        const res = await fetch(`/api/chat?documentId=${documentId}`);
        if (!res.ok) throw new Error('Failed to load chat history');
        const data = await res.json();
        setMessages(data.messages || []);
      } catch (err: unknown) {
        console.error('Error loading chat history:', err);
        setError('Failed to load chat history');
      } finally {
        setFetchingHistory(false);
      }
    };

    fetchHistory();
  }, [documentId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userQuery = input.trim();
    setInput('');
    setError(null);

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userQuery,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      quotes: [],
    };

    setMessages((prev) => [...prev, assistantMessage]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response stream received from AI API');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('0:')) {
            try {
              const textPiece = JSON.parse(line.slice(2));
              streamedContent += textPiece;
            } catch {
              streamedContent += line.slice(2);
            }
          } else if (!line.startsWith('d:') && !line.startsWith('e:')) {
            streamedContent += line;
          }
        }

        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantId ? { ...msg, content: streamedContent } : msg))
        );
      }

      if (streamedContent) {
        try {
          const verifyRes = await fetch('/api/chat/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId, text: streamedContent }),
          });
          if (verifyRes.ok) {
            const vData = await verifyRes.json();
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, quotes: vData.quotes || [] } : msg
              )
            );
          }
        } catch (vErr) {
          console.error('Error verifying quotes post-stream:', vErr);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('User stopped generation');
      } else {
        const msg = err instanceof Error ? err.message : 'Error generating answer';
        setError(msg);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleQuoteClick = (quoteText: string) => {
    if (onSelectQuote) onSelectQuote(quoteText);
    if (onOpenDocumentView) onOpenDocumentView();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Header */}
      <div className="h-12 px-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <Bot className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-slate-200">Contract Q&A & Quote Verification</span>
          <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-full truncate max-w-[180px]">
            {filename}
          </span>
          {isLargeDocument && (
            <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full flex items-center space-x-1">
              <Layers className="w-3 h-3" />
              <span>Large Contract Strategy Active ({pageCount} pgs)</span>
            </span>
          )}
        </div>

        {fetchingHistory && <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
      </div>

      {/* Messages List Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {fetchingHistory ? (
          <div className="text-center py-12 text-xs text-slate-500">Loading conversation history...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 mx-auto bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">Ask questions with verified quote proof</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Every quote is verified against the document text. Clicking verified quotes highlights them inside the document viewer!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const hasNotice = msg.content.includes('[NOTICE: Evaluated');
            const cleanContent = msg.content.replace(/\[NOTICE: Evaluated[^\]]+\]/, '').trim();
            const noticeMatch = msg.content.match(/\[NOTICE: Evaluated[^\]]+\]/);

            return (
              <div
                key={msg.id}
                className={`flex items-start space-x-3 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className="max-w-[85%] space-y-2">
                  <div
                    className={`rounded-2xl p-4 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-600/10'
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-xl'
                    }`}
                  >
                    {cleanContent ? renderFormattedText(cleanContent) : (isLoading && msg.role === 'assistant' ? (
                      <span className="inline-flex items-center space-x-1.5 text-slate-400">
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse delay-150"></span>
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse delay-300"></span>
                      </span>
                    ) : '')}
                  </div>

                  {hasNotice && noticeMatch && (
                    <div className="p-2.5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-[11px] text-indigo-300 flex items-start space-x-2">
                      <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span>{noticeMatch[0].replace('[', '').replace(']', '')}</span>
                    </div>
                  )}

                  {/* Verified / Unverified Quotes Section */}
                  {msg.role === 'assistant' && msg.quotes && msg.quotes.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {msg.quotes.map((q, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border text-xs transition ${
                            q.status === 'verified'
                              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                              : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                          }`}
                        >
                          <div className="flex items-start justify-between space-x-2">
                            <div className="flex items-center space-x-1.5">
                              {q.status === 'verified' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                              )}
                              <span
                                className={`text-[11px] font-bold uppercase tracking-wider ${
                                  q.status === 'verified' ? 'text-emerald-400' : 'text-amber-400'
                                }`}
                              >
                                {q.status === 'verified' ? 'Verified Quote' : 'Unverified / Paraphrased Quote'}
                              </span>
                              {q.status === 'verified' && q.pageNumber && (
                                <span className="text-[10px] bg-emerald-900/60 border border-emerald-500/40 px-1.5 py-0.5 rounded text-emerald-300 font-mono">
                                  Page {q.pageNumber} {q.startOffset !== undefined ? `• Pos: ${q.startOffset}` : ''}
                                </span>
                              )}
                            </div>

                            {q.status === 'verified' && (
                              <button
                                onClick={() => handleQuoteClick(q.quoteText)}
                                className="text-[10px] text-emerald-300 hover:text-emerald-100 flex items-center space-x-1 underline font-medium"
                              >
                                <span>Highlight in Contract</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <p className="mt-1.5 font-mono text-[11px] bg-black/30 p-2 rounded-lg italic">
                            "{q.quoteText}"
                          </p>

                          {q.status === 'unverified' && q.matchedSourceText && (
                            <div className="mt-2 text-[11px] text-amber-300/90 border-t border-amber-500/20 pt-1.5">
                              <span className="font-semibold block text-amber-400">Matched Source Passage in Doc:</span>
                              <span className="italic">"{q.matchedSourceText}"</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-950/60 border border-red-500/30 rounded-xl flex items-center space-x-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Input Box & Control Bar */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask a question about ${filename}...`}
            disabled={isLoading}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition disabled:opacity-50"
          />

          {isLoading ? (
            <button
              type="button"
              onClick={handleStopGeneration}
              className="py-2.5 px-4 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 font-semibold text-xs rounded-xl transition flex items-center space-x-1.5"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-semibold text-xs rounded-xl transition flex items-center space-x-1.5 shadow-md shadow-blue-600/20"
            >
              <span>Ask</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

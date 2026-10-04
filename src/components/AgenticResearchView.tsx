'use client';

import React, { useState } from 'react';
import { Bot, Wrench, Search, Play, CheckCircle2, AlertTriangle, Sparkles, Loader2, ArrowRight, ShieldCheck, Terminal } from 'lucide-react';
import { VerifiedQuote } from './ChatInterface';

interface ToolLog {
  round: number;
  toolName: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

interface AgenticResearchViewProps {
  documentId: string;
  filename: string;
  onOpenDocumentView?: () => void;
}

export default function AgenticResearchView({
  documentId,
  filename,
  onOpenDocumentView,
}: AgenticResearchViewProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [quotes, setQuotes] = useState<VerifiedQuote[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleRunResearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setError(null);
    setAnswer(null);
    setToolLogs([]);
    setQuotes([]);

    try {
      const res = await fetch('/api/agentic/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, query }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Agentic research failed');

      setAnswer(data.answer);
      setToolLogs(data.toolLogs || []);
      setQuotes(data.quotes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Research failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Top Header */}
      <div className="h-14 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl shadow-md shadow-purple-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-white flex items-center space-x-2">
              <span>Agentic Document Research Agent</span>
              <span className="text-[10px] uppercase font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">
                Multi-Round Tool Calling
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Autonomous search loop (`search_document`, `get_section`, `list_clauses`) • Contract: {filename}
            </p>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 bg-slate-950 border border-slate-800 px-3 py-1 rounded-xl">
          Hard Cap: <span className="font-bold text-purple-400">Max 5 Rounds</span>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Research Input Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <form onSubmit={handleRunResearch} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-300">
              Enter Research Query for Autonomous Agent:
            </label>

            <div className="flex items-center space-x-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. 'Investigate termination penalties, notice periods, and breach provisions'"
                  disabled={loading}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={!query.trim() || loading}
                className="py-2.5 px-5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold text-xs rounded-xl transition flex items-center space-x-2 shadow-lg shadow-purple-600/20 shrink-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executing Tool Loop...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Agentic Research</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-red-950/50 border border-red-500/30 rounded-xl flex items-center space-x-3 text-xs text-red-300">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Real-Time Tool Execution Loop Log */}
        {toolLogs.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center space-x-2 text-purple-400 border-b border-slate-800 pb-3">
              <Terminal className="w-4 h-4" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">
                Autonomous Tool Calling Execution Steps ({toolLogs.length} Rounds)
              </h3>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              {toolLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950 border border-purple-500/20 rounded-xl flex items-start space-x-3"
                >
                  <div className="p-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg text-[10px] font-bold uppercase shrink-0">
                    Round #{log.round}
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center space-x-2 text-slate-200">
                      <Wrench className="w-3.5 h-3.5 text-purple-400" />
                      <span className="font-bold text-purple-300">{log.toolName}</span>
                      <span className="text-[10px] text-slate-400">
                        Args: {JSON.stringify(log.args)}
                      </span>
                    </div>

                    <div className="text-[11px] text-emerald-400 flex items-center space-x-1">
                      <ArrowRight className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>{log.resultSummary}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Final Agentic Answer Card */}
        {answer && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-emerald-400 border-b border-slate-800 pb-3">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="font-bold text-sm text-white">Agentic Research Synthesis</h3>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{answer}</p>

            {/* Verified Quotes Section */}
            {quotes.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Verified Quotes Extracted by Agent:
                </h4>

                {quotes.map((q, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border text-xs ${
                      q.status === 'verified'
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                        : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-1.5">
                        {q.status === 'verified' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                        )}
                        <span className="font-bold uppercase text-[10px]">
                          {q.status === 'verified' ? 'Verified Quote' : 'Unverified / Paraphrased'}
                        </span>
                      </div>
                    </div>

                    <p className="font-mono text-[11px] bg-black/30 p-2 rounded-lg italic">
                      "{q.quoteText}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

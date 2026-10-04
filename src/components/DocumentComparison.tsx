'use client';

import React, { useState, useEffect } from 'react';
import { GitCompare, AlertTriangle, ShieldAlert, ShieldCheck, Filter, ArrowRight, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { DocumentItem } from './DocumentLibrary';

interface ClauseDiffItem {
  id: string;
  clauseTitle: string;
  changeType: 'modified' | 'added' | 'removed';
  severity: 'high' | 'medium' | 'low';
  doc1Text?: string;
  doc2Text?: string;
  substantiveSummary: string;
}

interface ComparisonReport {
  doc1Name: string;
  doc2Name: string;
  executiveSummary: string;
  stats: {
    totalChanges: number;
    highRiskChanges: number;
    mediumRiskChanges: number;
    lowRiskChanges: number;
  };
  diffs: ClauseDiffItem[];
}

interface DocumentComparisonProps {
  initialDoc1Id?: string | null;
}

export default function DocumentComparison({ initialDoc1Id }: DocumentComparisonProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [doc1Id, setDoc1Id] = useState<string>(initialDoc1Id || '');
  const [doc2Id, setDoc2Id] = useState<string>('');
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);

  const [comparing, setComparing] = useState<boolean>(false);
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  useEffect(() => {
    const fetchDocs = async () => {
      setLoadingDocs(true);
      try {
        const res = await fetch('/api/documents');
        if (res.ok) {
          const data = await res.json();
          const docs: DocumentItem[] = data.documents || [];
          setDocuments(docs);
          if (docs.length >= 2) {
            setDoc1Id(initialDoc1Id && docs.some((d) => d.id === initialDoc1Id) ? initialDoc1Id : docs[0].id);
            setDoc2Id(docs[1].id);
          } else if (docs.length === 1) {
            setDoc1Id(docs[0].id);
          }
        }
      } catch (err) {
        console.error('Error loading documents for comparison:', err);
      } finally {
        setLoadingDocs(false);
      }
    };

    fetchDocs();
  }, [initialDoc1Id]);

  const handleCompare = async () => {
    if (!doc1Id || !doc2Id || doc1Id === doc2Id) return;

    setComparing(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch('/api/documents/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc1Id, doc2Id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to compare documents');

      setReport(data.report);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  };

  const filteredDiffs = report
    ? report.diffs.filter((d) => (severityFilter === 'all' ? true : d.severity === severityFilter))
    : [];

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Top Selector Bar */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <GitCompare className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-sm text-slate-100">Contract Version Comparison & Substantive Diff</h2>
          </div>
          <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2.5 py-0.5 rounded-full uppercase font-semibold">
            Clause-Level Analysis
          </span>
        </div>

        {/* Contract Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
          <div className="md:col-span-2">
            <label className="block text-[11px] text-slate-400 font-medium mb-1">Version 1 (Original Contract)</label>
            <select
              value={doc1Id}
              onChange={(e) => setDoc1Id(e.target.value)}
              disabled={loadingDocs || comparing}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename} ({d.pageCount} pgs)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-center pt-4 md:pt-0">
            <ArrowRight className="w-5 h-5 text-slate-500 hidden md:block" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] text-slate-400 font-medium mb-1">Version 2 (Revised Contract)</label>
            <select
              value={doc2Id}
              onChange={(e) => setDoc2Id(e.target.value)}
              disabled={loadingDocs || comparing}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename} ({d.pageCount} pgs)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleCompare}
            disabled={!doc1Id || !doc2Id || doc1Id === doc2Id || comparing}
            className="py-2 px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-xs rounded-xl transition flex items-center space-x-2 shadow-lg shadow-blue-600/20"
          >
            {comparing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Comparing Clauses with AI...</span>
              </>
            ) : (
              <>
                <GitCompare className="w-4 h-4" />
                <span>Run Substantive Diff Comparison</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-950/50 border border-red-500/30 rounded-xl flex items-center space-x-3 text-xs text-red-300">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!report && !comparing && (
          <div className="text-center py-20">
            <GitCompare className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-300">Compare Two Contract Versions</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Select an original and revised contract above to extract clause-level substantive differences and legal risk summaries.
            </p>
          </div>
        )}

        {report && (
          <>
            {/* Executive Summary Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center space-x-2 mb-2 text-blue-400">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="font-bold text-sm text-white">Substantive Impact Summary</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{report.executiveSummary}</p>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="block text-lg font-bold text-white">{report.stats.totalChanges}</span>
                  <span className="text-[10px] text-slate-400 uppercase font-medium">Total Clause Changes</span>
                </div>
                <div className="bg-red-950/30 p-3 rounded-xl border border-red-500/20 text-center">
                  <span className="block text-lg font-bold text-red-400">{report.stats.highRiskChanges}</span>
                  <span className="text-[10px] text-red-300 uppercase font-medium">High Risk</span>
                </div>
                <div className="bg-amber-950/30 p-3 rounded-xl border border-amber-500/20 text-center">
                  <span className="block text-lg font-bold text-amber-400">{report.stats.mediumRiskChanges}</span>
                  <span className="text-[10px] text-amber-300 uppercase font-medium">Medium Risk</span>
                </div>
                <div className="bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/20 text-center">
                  <span className="block text-lg font-bold text-emerald-400">{report.stats.lowRiskChanges}</span>
                  <span className="text-[10px] text-emerald-300 uppercase font-medium">Low Risk</span>
                </div>
              </div>
            </div>

            {/* Severity Filter Tabs */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-300">Filter by Significance:</span>
              </div>

              <div className="flex items-center space-x-1 bg-slate-900 p-1 border border-slate-800 rounded-xl">
                {(['all', 'high', 'medium', 'low'] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition ${
                      severityFilter === sev
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sev} {sev === 'all' ? `(${report.stats.totalChanges})` : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Clause Diff List */}
            <div className="space-y-4">
              {filteredDiffs.map((diff) => (
                <div key={diff.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      <h4 className="font-bold text-sm text-white">{diff.clauseTitle}</h4>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          diff.changeType === 'added'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : diff.changeType === 'removed'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}
                      >
                        {diff.changeType}
                      </span>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          diff.severity === 'high'
                            ? 'bg-red-950 text-red-400 border border-red-500/30'
                            : diff.severity === 'medium'
                            ? 'bg-amber-950 text-amber-400 border border-amber-500/30'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {diff.severity} Risk
                      </span>
                    </div>
                  </div>

                  {/* Substantive Summary Explanation */}
                  <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-blue-200">
                    <span className="font-bold block text-blue-400 text-[11px] uppercase tracking-wider mb-0.5">
                      Substantive Impact:
                    </span>
                    {diff.substantiveSummary}
                  </div>

                  {/* Side-by-Side Clause Text Diff */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
                    {diff.doc1Text && (
                      <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-red-200/90 font-mono text-[11px]">
                        <span className="font-sans font-bold text-red-400 block text-[10px] uppercase mb-1">
                          Version 1 ({report.doc1Name}):
                        </span>
                        "{diff.doc1Text}"
                      </div>
                    )}

                    {diff.doc2Text && (
                      <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-emerald-200/90 font-mono text-[11px]">
                        <span className="font-sans font-bold text-emerald-400 block text-[10px] uppercase mb-1">
                          Version 2 ({report.doc2Name}):
                        </span>
                        "{diff.doc2Text}"
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Plus,
  CheckCircle,
  XCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  Flag,
  Send,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '@/components/ui/modal';
import {
  Evidence,
  HallucinationThreshold,
  DetectedHallucination,
  HallucinationResult,
} from '@/types';
import { THRESHOLD_CONFIGS, findQuoteInEssay } from '@/lib/hallucination-utils';

type TabId = 'verification' | 'issues' | 'reported';

const HALLUCINATION_TYPES = [
  'Factual Error',
  'Fabricated Quote',
  'Highlighting Error',
] as const;

interface HallucinationPanelProps {
  essayContent: string;
  evidenceQuotes: Evidence[];
  onHallucinationReported?: (hallucination: DetectedHallucination) => void;
  hallucinationThreshold: HallucinationThreshold;
  criterionName: string;
  onHallucinationDetected?: (hallucinations: DetectedHallucination[]) => void;
}

interface VerificationItem {
  quote: string;
  result: HallucinationResult;
  evidence: Evidence;
}

export default function HallucinationPanel({
  essayContent,
  evidenceQuotes,
  onHallucinationReported,
  hallucinationThreshold,
  criterionName,
  onHallucinationDetected,
}: HallucinationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('issues');
  const [hallucinations, setHallucinations] = useState<DetectedHallucination[]>([]);
  const [reportedItems, setReportedItems] = useState<DetectedHallucination[]>([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // Report form state
  const [reportType, setReportType] = useState<string>(HALLUCINATION_TYPES[0]);
  const [reportQuote, setReportQuote] = useState('');
  const [reportExplanation, setReportExplanation] = useState('');
  const [reportCorrection, setReportCorrection] = useState('');

  const thresholdConfig = THRESHOLD_CONFIGS[hallucinationThreshold];

  // Verify all quotes against essay content
  const verificationResults = useMemo<VerificationItem[]>(() => {
    return evidenceQuotes.map((ev) => ({
      quote: ev.quote,
      result: findQuoteInEssay(ev.quote, essayContent, hallucinationThreshold),
      evidence: ev,
    }));
  }, [evidenceQuotes, essayContent, hallucinationThreshold]);

  // Auto-detect hallucinations from not-found quotes
  useMemo(() => {
    const detected: DetectedHallucination[] = verificationResults
      .filter((v) => !v.result.found)
      .map((v, i) => ({
        id: `auto-${i}-${v.quote.slice(0, 20)}`,
        type: 'Fabricated Quote',
        quote: v.quote.slice(0, 80),
        fullQuote: v.quote,
        correction: '',
        severity: v.result.confidence < 0.3 ? 'high' as const : v.result.confidence < 0.5 ? 'medium' as const : 'low' as const,
        confidence: Math.round((1 - v.result.confidence) * 100),
        status: 'detected' as const,
        matchResult: v.result,
        criterionName,
      }));

    if (detected.length !== hallucinations.filter((h) => h.status === 'detected').length) {
      setHallucinations((prev) => {
        const nonDetected = prev.filter((h) => h.status !== 'detected');
        return [...nonDetected, ...detected];
      });
      onHallucinationDetected?.(detected);
    }
  }, [verificationResults, criterionName]);

  const notFoundCount = verificationResults.filter((v) => !v.result.found).length;

  const pendingCount = hallucinations.filter((h) => h.status === 'detected').length;
  const confirmedCount = hallucinations.filter((h) => h.status === 'confirmed').length;

  const allClear = notFoundCount === 0 && reportedItems.length === 0;

  const handleConfirm = useCallback((id: string) => {
    setHallucinations((prev) =>
      prev.map((h) => (h.id === id ? { ...h, status: 'confirmed' as const } : h))
    );
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setHallucinations((prev) =>
      prev.map((h) => (h.id === id ? { ...h, status: 'dismissed' as const } : h))
    );
  }, []);

  function resetReportForm() {
    setReportType(HALLUCINATION_TYPES[0]);
    setReportQuote('');
    setReportExplanation('');
    setReportCorrection('');
  }

  function handleSubmitReport() {
    const reported: DetectedHallucination = {
      id: `reported-${Date.now()}`,
      type: reportType,
      quote: reportQuote.slice(0, 80),
      fullQuote: reportQuote,
      correction: reportCorrection,
      severity: 'medium',
      confidence: 100,
      status: 'teacher-reported',
      matchResult: { found: false, confidence: 0, matchType: 'teacher-reported' },
      criterionName,
      explanation: reportExplanation,
      reportedAt: new Date().toISOString(),
    };
    setReportedItems((prev) => [...prev, reported]);
    onHallucinationReported?.(reported);
    resetReportForm();
    setReportModalOpen(false);
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'issues', label: 'Issues' },
    { id: 'reported', label: 'Reported' },
  ];

  function severityColor(severity: string) {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-[#EF4444] dark:bg-red-900/30 dark:text-red-400';
      case 'medium':
        return 'bg-amber-100 text-[#F59E0B] dark:bg-amber-900/30 dark:text-amber-400';
      case 'low':
        return 'bg-green-100 text-[#10B981] dark:bg-green-900/30 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  }

  return (
    <div className={`mt-4 rounded-xl border shadow-sm ${allClear ? 'border-green-200 bg-green-50/30 dark:border-green-800/40 dark:bg-green-950/10' : 'border-amber-200 bg-amber-50/30 dark:border-amber-800/40 dark:bg-amber-950/10'}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="cursor-pointer flex w-full items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-3">
          {allClear ? (
            <ShieldCheck className="h-5 w-5 text-[#10B981]" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-[#F59E0B]" />
          )}
          <span className="text-sm font-semibold text-[#1E1B4B] dark:text-[#E2E8F0]">
            Hallucination Check
          </span>
          {allClear && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-[#10B981] dark:bg-green-900/30 dark:text-green-400">
              All Clear
            </span>
          )}
          {notFoundCount > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-[#EF4444] dark:bg-red-900/40 dark:text-red-400">
              {notFoundCount}
            </span>
          )}
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-slate-700 dark:text-gray-400">
            Threshold: {hallucinationThreshold}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setReportModalOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                setReportModalOpen(true);
              }
            }}
            className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-amber-100 hover:text-[#F59E0B] dark:hover:bg-amber-900/30"
            title="Report hallucination"
          >
            <Plus className="h-4 w-4" />
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-5 w-5 text-gray-400" />
          </motion.div>
        </div>
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className={`border-t ${allClear ? 'border-green-200 dark:border-green-800/40' : 'border-amber-200 dark:border-amber-800/40'}`}>
              {allClear && (
                <div className="flex flex-col items-center gap-3 px-5 py-8">
                  <ShieldCheck className="h-10 w-10 text-[#10B981]" />
                  <p className="text-sm font-medium text-[#10B981]">No hallucinations detected</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">All {verificationResults.length} evidence quotes were verified in the essay.</p>
                  <button
                    onClick={() => setReportModalOpen(true)}
                    className="cursor-pointer mt-1 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    Report a Hallucination Manually
                  </button>
                </div>
              )}
              {!allClear && <>
              {/* Tabs */}
              <div className="flex border-b border-amber-200 dark:border-amber-800/40">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`cursor-pointer flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      activeTab === tab.id
                        ? 'border-b-2 border-[#6366F1] text-[#6366F1] dark:text-[#818CF8]'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {tab.label}
                    {tab.id === 'issues' && hallucinations.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-[#EF4444] dark:bg-red-900/40">
                        {hallucinations.length}
                      </span>
                    )}
                    {tab.id === 'reported' && reportedItems.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs text-[#6366F1] dark:bg-indigo-900/40">
                        {reportedItems.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="max-h-80 overflow-y-auto px-5 py-4">
                {/* Quote Verification Tab */}
                {activeTab === 'verification' && (
                  <div className="space-y-3">
                    {verificationResults.length === 0 ? (
                      <p className="py-4 text-center text-sm text-gray-400">
                        No evidence quotes to verify.
                      </p>
                    ) : (
                      verificationResults.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-gray-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            {item.result.found ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-[#10B981] dark:bg-green-900/30 dark:text-green-400">
                                <ShieldCheck className="h-3 w-3" />
                                Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-[#EF4444] dark:bg-red-900/30 dark:text-red-400">
                                <ShieldAlert className="h-3 w-3" />
                                Not Found
                              </span>
                            )}
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-slate-700 dark:text-gray-400">
                              {item.result.matchType}
                            </span>
                            <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400">
                              {Math.round(item.result.confidence * 100)}% confidence
                            </span>
                          </div>
                          <p className="text-sm italic text-[#1E1B4B]/70 dark:text-[#E2E8F0]/70">
                            &ldquo;{item.quote}&rdquo;
                          </p>
                          {!item.result.found && item.result.closestMatch && (
                            <div className="mt-2 rounded-md bg-gray-50 p-2 dark:bg-slate-700/50">
                              <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <Search className="h-3 w-3" />
                                Closest match:
                              </p>
                              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                &ldquo;{item.result.closestMatch}&rdquo;
                              </p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Issues Tab */}
                {activeTab === 'issues' && (
                  <div className="space-y-3">
                    {hallucinations.length === 0 ? (
                      <p className="py-4 text-center text-sm text-gray-400">
                        No issues detected.
                      </p>
                    ) : (
                      hallucinations.map((h) => (
                        <div
                          key={h.id}
                          className="rounded-lg border border-gray-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${severityColor(h.severity)}`}>
                              {h.severity.charAt(0).toUpperCase() + h.severity.slice(1)}
                            </span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-slate-700 dark:text-gray-400">
                              {h.type}
                            </span>
                            <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400">
                              {h.confidence}% confidence
                            </span>
                          </div>

                          <p className="text-sm italic text-[#1E1B4B]/70 dark:text-[#E2E8F0]/70">
                            &ldquo;{h.fullQuote}&rdquo;
                          </p>

                          {h.correction && (
                            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                              <span className="font-semibold">Correction:</span> {h.correction}
                            </p>
                          )}

                          {h.status === 'detected' && (
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() => handleConfirm(h.id)}
                                className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-[#EF4444] transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Confirm
                              </button>
                              <button
                                onClick={() => handleDismiss(h.id)}
                                className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Dismiss
                              </button>
                            </div>
                          )}

                          {h.status === 'confirmed' && (
                            <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#EF4444]">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Confirmed
                            </div>
                          )}

                          {h.status === 'dismissed' && (
                            <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                              <XCircle className="h-3.5 w-3.5" />
                              Dismissed
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Reported Tab */}
                {activeTab === 'reported' && (
                  <div className="space-y-3">
                    {reportedItems.length === 0 ? (
                      <div className="py-6 text-center">
                        <Flag className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                        <p className="text-sm text-gray-400">
                          No reported hallucinations yet.
                        </p>
                        <button
                          onClick={() => setReportModalOpen(true)}
                          className="cursor-pointer mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600"
                        >
                          <Plus className="h-4 w-4" />
                          Report a Hallucination
                        </button>
                      </div>
                    ) : (
                      <>
                        {reportedItems.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-indigo-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-[#6366F1] dark:bg-indigo-900/40 dark:text-[#818CF8]">
                                <Flag className="h-3 w-3" />
                                Teacher Reported
                              </span>
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-slate-700 dark:text-gray-400">
                                {item.type}
                              </span>
                            </div>
                            <p className="text-sm italic text-[#1E1B4B]/70 dark:text-[#E2E8F0]/70">
                              &ldquo;{item.fullQuote}&rdquo;
                            </p>
                            {item.explanation && (
                              <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
                                {item.explanation}
                              </p>
                            )}
                            {item.correction && (
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                <span className="font-semibold">Correction:</span>{' '}
                                {item.correction}
                              </p>
                            )}
                            {item.reportedAt && (
                              <p className="mt-1.5 text-xs text-gray-400">
                                Reported: {new Date(item.reportedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => setReportModalOpen(true)}
                          className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-[#6366F1] transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-[#818CF8]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Report Another
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              </>}
              {/* Footer */}
              <div className={`flex items-center gap-4 border-t px-5 py-3 ${allClear ? 'border-green-200 dark:border-green-800/40' : 'border-amber-200 dark:border-amber-800/40'}`}>
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <ShieldAlert className="h-3.5 w-3.5 text-[#F59E0B]" />
                  Pending Review: {pendingCount}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <CheckCircle className="h-3.5 w-3.5 text-[#EF4444]" />
                  Confirmed: {confirmedCount}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <Flag className="h-3.5 w-3.5 text-[#6366F1]" />
                  Reported: {reportedItems.length}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Modal */}
      <Modal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          resetReportForm();
        }}
        title="Report a Hallucination"
      >
        <div className="space-y-4">
          {/* Type dropdown */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
              Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="cursor-pointer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-[#1E1B4B] outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-[#E2E8F0]"
            >
              {HALLUCINATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Quote textarea */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
              Quote
            </label>
            <textarea
              value={reportQuote}
              onChange={(e) => setReportQuote(e.target.value)}
              placeholder="Paste the problematic quote here..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-[#1E1B4B] outline-none transition-colors focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-[#E2E8F0]"
            />
          </div>

          {/* Explanation textarea */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
              Explanation
            </label>
            <textarea
              value={reportExplanation}
              onChange={(e) => setReportExplanation(e.target.value)}
              placeholder="Explain why this is a hallucination..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-[#1E1B4B] outline-none transition-colors focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-[#E2E8F0]"
            />
          </div>

          {/* Correction textarea */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
              Correction
            </label>
            <textarea
              value={reportCorrection}
              onChange={(e) => setReportCorrection(e.target.value)}
              placeholder="What is the correct information?"
              rows={2}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-[#1E1B4B] outline-none transition-colors focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-[#E2E8F0]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setReportModalOpen(false);
                resetReportForm();
              }}
              className="cursor-pointer rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitReport}
              disabled={!reportQuote.trim()}
              className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Submit Report
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

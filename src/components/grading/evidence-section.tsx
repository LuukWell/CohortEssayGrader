'use client';

import React from 'react';
import { ChevronDown, ChevronUp, MapPin, Quote, Tag, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Assessment } from '@/types';

interface EvidenceSectionProps {
  showEvidence: boolean;
  setShowEvidence: (value: boolean) => void;
  currentAssessment: Assessment;
  hoveredEvidenceIndex: number | null;
  setHoveredEvidenceIndex: (index: number | null) => void;
  hoveredAssessmentIndexes: number[];
  setHoveredAssessmentIndexes: (indexes: number[]) => void;
}

export default function EvidenceSection({
  showEvidence,
  setShowEvidence,
  currentAssessment,
  hoveredEvidenceIndex,
  setHoveredEvidenceIndex,
  hoveredAssessmentIndexes,
  setHoveredAssessmentIndexes,
}: EvidenceSectionProps) {
  const evidence = currentAssessment.evidence ?? [];

  return (
    <div className="mt-4">
      {!showEvidence ? (
        <button
          onClick={() => setShowEvidence(true)}
          className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-[#6366F1] transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-[#818CF8] dark:hover:bg-indigo-950/60"
        >
          <Quote className="h-4 w-4" />
          Show Supporting Evidence
          <ChevronDown className="h-4 w-4" />
        </button>
      ) : (
        <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#6366F1]">
              Supporting Evidence
            </h3>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-[#6366F1] dark:bg-indigo-900/40 dark:text-[#818CF8]">
              {evidence.length} quote{evidence.length !== 1 ? 's' : ''}
            </span>
          </div>

          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="max-h-[400px] space-y-3 overflow-y-auto pr-1"
            >
              {evidence.map((item, idx) => (
                <div
                  key={idx}
                  onMouseEnter={() => {
                    setHoveredEvidenceIndex(idx);
                    if (item.relatedAssessmentIndexes) {
                      setHoveredAssessmentIndexes(item.relatedAssessmentIndexes);
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredEvidenceIndex(null);
                    setHoveredAssessmentIndexes([]);
                  }}
                  className={`cursor-default rounded-lg border p-4 transition-all ${
                    hoveredEvidenceIndex === idx
                      ? 'border-[#6366F1] bg-indigo-50/50 shadow-md dark:border-[#818CF8] dark:bg-indigo-950/20'
                      : 'border-gray-100 bg-gray-50 hover:border-gray-200 dark:border-slate-700 dark:bg-slate-700/30 dark:hover:border-slate-600'
                  }`}
                >
                  {/* Location badge */}
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-[#6366F1] dark:bg-indigo-900/40 dark:text-[#818CF8]">
                      <MapPin className="h-3 w-3" />
                      {item.paragraph || 'Essay excerpt'}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Evidence #{idx + 1}
                    </span>
                  </div>

                  {/* Blockquote */}
                  <blockquote className="border-l-3 border-[#6366F1] pl-4 text-sm italic text-[#1E1B4B]/80 dark:text-[#E2E8F0]/80">
                    &ldquo;{item.quote}&rdquo;
                  </blockquote>

                  {/* Context */}
                  {item.context && (
                    <div className="mt-2.5 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <FileText className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{item.context}</span>
                    </div>
                  )}

                  {/* Keywords */}
                  {item.keywords && item.keywords.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Tag className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                      {item.keywords.map((kw, kwIdx) => (
                        <span
                          key={kwIdx}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-slate-600 dark:text-gray-300"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </motion.div>
          </AnimatePresence>

          <button
            onClick={() => setShowEvidence(false)}
            className="cursor-pointer mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
          >
            <ChevronUp className="h-4 w-4" />
            Hide Evidence
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle } from 'lucide-react';
import { Criterion } from '@/types';
import llmService from '@/lib/llm-service';

interface RubricPreviewProps {
  rubricContent: string;
  onStartGrading: () => void;
  onReviseRubric: () => void;
  pdfUploaded: boolean;
  hideStartButton?: boolean;
}

export default function RubricPreview({
  rubricContent,
  onStartGrading,
  onReviseRubric,
  pdfUploaded,
  hideStartButton,
}: RubricPreviewProps) {
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rubricContent) return;

    let cancelled = false;
    const parse = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await llmService.extractRubricCriteria(rubricContent);
        if (!cancelled && result !== 'NO_VALID_RUBRIC') setCriteria(result);
        if (!cancelled && result === 'NO_VALID_RUBRIC') setError('Could not extract valid rubric criteria.');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to parse rubric');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    parse();
    return () => {
      cancelled = true;
    };
  }, [rubricContent]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="h-10 w-10 text-[#6366F1]" />
        </motion.div>
        <p className="mt-4 text-sm text-gray-500 dark:text-slate-400">Parsing rubric criteria...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20">
          <AlertCircle className="h-5 w-5 text-[#EF4444]" />
          <p className="text-sm text-[#EF4444]">{error}</p>
        </div>
        <button
          onClick={onReviseRubric}
          className="mt-4 cursor-pointer rounded-lg border border-[#EF4444] px-5 py-2.5 text-sm font-medium text-[#EF4444] transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          Revise Rubric
        </button>
      </div>
    );
  }

  const isDisabled = criteria.length === 0 || !pdfUploaded;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800/50">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-[#F5F3FF] dark:border-slate-700 dark:bg-slate-800">
              <th className="px-4 py-3 font-semibold" style={{ color: 'var(--foreground)' }}>
                Criterion
              </th>
              <th className="px-4 py-3 font-semibold" style={{ color: 'var(--foreground)' }}>
                Score Range
              </th>
              <th className="px-4 py-3 font-semibold" style={{ color: 'var(--foreground)' }}>
                Description / Levels
              </th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((criterion, idx) => (
              <motion.tr
                key={criterion.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="border-b border-gray-100 last:border-b-0 dark:border-slate-700/50"
              >
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--foreground)' }}>
                  {criterion.name}
                </td>
                <td className="px-4 py-3" style={{ color: '#475569' }}>
                  {criterion.scoreRange.min} &ndash; {criterion.scoreRange.max}
                </td>
                <td className="px-4 py-3">
                  <ul className="space-y-1">
                    {criterion.levels.map((level) => (
                      <li key={level.score} style={{ color: '#475569' }}>
                        <span className="font-medium" style={{ color: 'var(--foreground)' }}>
                          Score {level.score}:
                        </span>{' '}
                        {level.description}
                      </li>
                    ))}
                  </ul>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {!hideStartButton && (
        <div className="flex justify-end">
          <button
            onClick={onStartGrading}
            disabled={isDisabled}
            className="cursor-pointer rounded-lg bg-[#10B981] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0EA572] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start Grading
          </button>
        </div>
      )}

      {!hideStartButton && !pdfUploaded && criteria.length > 0 && (
        <p className="text-center text-sm text-[#F59E0B]">
          Please upload a PDF essay before starting the grading process.
        </p>
      )}
    </div>
  );
}

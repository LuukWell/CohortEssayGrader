'use client';

import React from 'react';
import { Octagon, AlertTriangle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface HallucinationWarningData {
  count: number;
  severity: 'high' | 'medium' | 'low';
  criterionName: string;
  message?: string;
}

interface HallucinationWarningProps {
  warning: HallucinationWarningData | null;
  onDismiss: () => void;
  onViewIssues?: () => void;
}

const SEVERITY_CONFIG = {
  high: {
    border: 'border-[#EF4444]',
    bg: 'bg-red-50 dark:bg-red-950/20',
    iconBg: 'bg-red-100 dark:bg-red-900/40',
    iconColor: 'text-[#EF4444]',
    Icon: Octagon,
    title: 'Critical Attention Required',
    subtitle: 'High-confidence hallucinations detected',
  },
  medium: {
    border: 'border-[#F59E0B]',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-[#F59E0B]',
    Icon: AlertTriangle,
    title: 'Attention Required',
    subtitle: 'Potential hallucinations detected',
  },
  low: {
    border: 'border-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconColor: 'text-blue-500',
    Icon: Info,
    title: 'Review Suggested',
    subtitle: 'Minor issues may need attention',
  },
};

export default function HallucinationWarning({
  warning,
  onDismiss,
  onViewIssues,
}: HallucinationWarningProps) {
  if (!warning) return null;

  const config = SEVERITY_CONFIG[warning.severity];
  const SeverityIcon = config.Icon;

  return (
    <AnimatePresence>
      {warning && (
        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`fixed right-6 top-6 z-50 w-96 rounded-xl border-l-4 ${config.border} ${config.bg} p-5 shadow-xl`}
        >
          {/* Close button */}
          <button
            onClick={onDismiss}
            className="cursor-pointer absolute right-3 top-3 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex gap-3">
            {/* Icon */}
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.iconBg}`}>
              <SeverityIcon className={`h-5 w-5 ${config.iconColor}`} />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-[#1E1B4B] dark:text-[#E2E8F0]">
                {config.title}
              </h4>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {config.subtitle}
              </p>

              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Criterion
                  </span>
                  <span className="text-xs font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
                    {warning.criterionName}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Issues found
                  </span>
                  <span className={`text-xs font-bold ${config.iconColor}`}>
                    {warning.count}
                  </span>
                </div>
              </div>

              {warning.message && (
                <p className="mt-2.5 text-xs text-gray-600 dark:text-gray-300">
                  {warning.message}
                </p>
              )}

              {/* Action buttons */}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={onDismiss}
                  className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
                >
                  Review Later
                </button>
                <button
                  onClick={() => {
                    onViewIssues?.();
                    onDismiss();
                  }}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors ${
                    warning.severity === 'high'
                      ? 'bg-[#EF4444] hover:bg-red-600'
                      : warning.severity === 'medium'
                        ? 'bg-[#F59E0B] hover:bg-amber-600'
                        : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  View Issues
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

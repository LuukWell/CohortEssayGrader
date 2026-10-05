'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { AlignJustify, List, ShieldCheck, ShieldAlert, Shield, Info } from 'lucide-react';
import type { AssessmentType, AssessmentLength, HallucinationThreshold } from '@/types';

function HallucinationInfoTooltip() {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button
        type="button"
        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:text-[#6366F1]"
        aria-label="What are hallucinations?"
      >
        <Info className="h-4 w-4" />
      </button>
      {show && (
        <div className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 shadow-lg">
          <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>What are AI hallucinations?</p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            When AI grades an essay, it may fabricate quotes, cite non-existent sources, or misattribute information that doesn&apos;t actually appear in the text. This setting controls how aggressively the system flags these potential inaccuracies. Higher sensitivity catches more issues but may produce false positives.
          </p>
          <div className="mt-1.5 h-px w-full" style={{ background: 'var(--card-border)' }} />
          <p className="mt-1.5 text-[10px]" style={{ color: 'var(--muted)' }}>
            <strong>Low:</strong> Only flag high-confidence issues &middot; <strong>Medium:</strong> Balanced detection &middot; <strong>High:</strong> Flag all potential issues
          </p>
        </div>
      )}
    </div>
  );
}

interface AssessmentSettingsProps {
  assessmentType: AssessmentType;
  setAssessmentType: (type: AssessmentType) => void;
  assessmentLength: AssessmentLength;
  setAssessmentLength: (length: AssessmentLength) => void;
  hallucinationThreshold: HallucinationThreshold;
  setHallucinationThreshold: (threshold: HallucinationThreshold) => void;
}

export default function AssessmentSettings({
  assessmentType,
  setAssessmentType,
  assessmentLength,
  setAssessmentLength,
  hallucinationThreshold,
  setHallucinationThreshold,
}: AssessmentSettingsProps) {
  const typeOptions: { value: AssessmentType; label: string; icon: React.ReactNode }[] = [
    { value: 'flow', label: 'Flow Text', icon: <AlignJustify className="h-5 w-5" /> },
    { value: 'bullets', label: 'Bullet Points', icon: <List className="h-5 w-5" /> },
  ];

  const lengthOptions: { value: AssessmentLength; label: string; iconSize: string }[] = [
    { value: 'long', label: 'Long', iconSize: 'h-6 w-6' },
    { value: 'medium', label: 'Medium', iconSize: 'h-5 w-5' },
    { value: 'short', label: 'Short', iconSize: 'h-4 w-4' },
  ];

  const thresholdOptions: { value: HallucinationThreshold; label: string; description: string; icon: React.ReactNode }[] = [
    { value: 'low', label: 'Low', description: 'Fewer flags', icon: <ShieldCheck className="h-5 w-5" /> },
    { value: 'medium', label: 'Medium', description: 'Balanced', icon: <ShieldAlert className="h-5 w-5" /> },
    { value: 'high', label: 'High', description: 'Strict', icon: <Shield className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-[#1E1B4B] dark:text-[#E2E8F0]">
          Assessment Format
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {typeOptions.map((option) => {
            const selected = assessmentType === option.value;
            return (
              <motion.button
                key={option.value}
                whileTap={{ scale: 0.98 }}
                onClick={() => setAssessmentType(option.value)}
                className={`cursor-pointer flex flex-col items-center gap-2 rounded-lg border-2 px-4 py-4 text-sm font-medium transition-colors ${
                  selected
                    ? 'border-[#6366F1] bg-[#F5F3FF] text-[#6366F1] dark:bg-[#6366F1]/10 dark:text-[#818CF8]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500'
                }`}
              >
                {option.icon}
                {option.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-[#1E1B4B] dark:text-[#E2E8F0]">
          Assessment Length
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {lengthOptions.map((option) => {
            const selected = assessmentLength === option.value;
            return (
              <motion.button
                key={option.value}
                whileTap={{ scale: 0.98 }}
                onClick={() => setAssessmentLength(option.value)}
                className={`cursor-pointer flex flex-col items-center gap-2 rounded-lg border-2 px-4 py-4 text-sm font-medium transition-colors ${
                  selected
                    ? 'border-[#6366F1] bg-[#F5F3FF] text-[#6366F1] dark:bg-[#6366F1]/10 dark:text-[#818CF8]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500'
                }`}
              >
                <AlignJustify className={option.iconSize} />
                {option.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[#1E1B4B] dark:text-[#E2E8F0]">
            Hallucination Sensitivity
          </h3>
          <HallucinationInfoTooltip />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {thresholdOptions.map((option) => {
            const selected = hallucinationThreshold === option.value;
            return (
              <motion.button
                key={option.value}
                whileTap={{ scale: 0.98 }}
                onClick={() => setHallucinationThreshold(option.value)}
                className={`cursor-pointer flex flex-col items-center gap-2 rounded-lg border-2 px-4 py-4 text-sm font-medium transition-colors ${
                  selected
                    ? 'border-[#6366F1] bg-[#F5F3FF] text-[#6366F1] dark:bg-[#6366F1]/10 dark:text-[#818CF8]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500'
                }`}
              >
                {option.icon}
                <span>{option.label}</span>
                <span className="text-xs opacity-70">{option.description}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, FileText, Settings2, Brain } from 'lucide-react';

interface WelcomeSectionProps {
  onContinue: () => void;
}

export default function WelcomeSection({ onContinue }: WelcomeSectionProps) {
  const steps = [
    'Upload your grading rubric (paste text or upload PDF)',
    'Upload the student essay as a PDF',
    'Configure assessment settings and hallucination sensitivity',
    'AI grades each criterion with evidence-based feedback',
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-lg rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-8 shadow-sm">
        {/* Icons row */}
        <div className="mb-6 flex items-center justify-center gap-6">
          {[ClipboardList, FileText, Settings2, Brain].map((Icon, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#F5F3FF] dark:bg-[#6366F1]/10"
            >
              <Icon className="h-6 w-6 text-[#6366F1]" />
            </motion.div>
          ))}
        </div>

        {/* Heading */}
        <h2 className="mb-2 text-center text-xl font-bold" style={{ color: 'var(--foreground)' }}>
          Interactive Rubric Grader
        </h2>
        <p className="mb-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
          AI-powered essay grading with custom rubrics, evidence-based scoring, and hallucination detection.
        </p>

        {/* Steps */}
        <ol className="mb-8 space-y-3">
          {steps.map((step, index) => (
            <motion.li
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              className="flex items-start gap-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#6366F1] text-xs font-bold text-white">
                {index + 1}
              </span>
              <span className="text-sm" style={{ color: 'var(--foreground)' }}>{step}</span>
            </motion.li>
          ))}
        </ol>

        {/* CTA */}
        <div className="flex justify-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onContinue}
            className="cursor-pointer rounded-lg bg-[#6366F1] px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#5558E6]"
          >
            Get Started
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

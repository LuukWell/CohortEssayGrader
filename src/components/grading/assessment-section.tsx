'use client';

import React from 'react';
import { Pencil, AlertTriangle } from 'lucide-react';
import { Assessment, AssessmentType } from '@/types';

interface AssessmentSectionProps {
  assessmentType: AssessmentType;
  currentAssessment: Assessment;
  hoveredAssessmentIndexes: number[];
  setHoveredAssessmentIndexes: (indexes: number[]) => void;
  onEditClick: () => void;
}

const SENTENCE_REGEX = /[^.!?]+[.!?]+/g;

function splitSentences(text: string): string[] {
  const matches = text.match(SENTENCE_REGEX);
  return matches ?? [text];
}

export default function AssessmentSection({
  assessmentType,
  currentAssessment,
  hoveredAssessmentIndexes,
  setHoveredAssessmentIndexes,
  onEditClick,
}: AssessmentSectionProps) {
  /* Use justification as the display source — revisedAssessmentText is
     now only used for the revision API, justification is always kept
     up-to-date with the latest content (bullets or flow text). */
  const displayText = currentAssessment.justification;

  const justificationText = Array.isArray(displayText)
    ? displayText.join(' ')
    : displayText;

  const justificationBullets = Array.isArray(displayText)
    ? displayText
    : splitSentences(displayText);

  const sentences = splitSentences(justificationText);

  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#6366F1]">
          Assessment
        </h3>
        <button
          onClick={onEditClick}
          className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-[#6366F1] transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-[#818CF8] dark:hover:bg-indigo-950/60"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>

      {/* Warning tag */}
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-[#F59E0B] dark:bg-amber-950/30 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        Editing will update AI score
      </div>

      {/* Justification display */}
      <div className="text-sm leading-relaxed text-[#1E1B4B] dark:text-[#E2E8F0]">
        {assessmentType === 'flow' ? (
          <p>
            {sentences.map((sentence, idx) => (
              <span
                key={idx}
                onMouseEnter={() => setHoveredAssessmentIndexes([idx])}
                onMouseLeave={() => setHoveredAssessmentIndexes([])}
                className={`cursor-default rounded px-0.5 transition-colors ${
                  hoveredAssessmentIndexes.includes(idx)
                    ? 'bg-indigo-100 dark:bg-indigo-900/40'
                    : ''
                }`}
              >
                {sentence}
              </span>
            ))}
          </p>
        ) : (
          <ul className="space-y-2">
            {justificationBullets.map((bullet, idx) => (
              <li
                key={idx}
                onMouseEnter={() => setHoveredAssessmentIndexes([idx])}
                onMouseLeave={() => setHoveredAssessmentIndexes([])}
                className={`cursor-default rounded-lg px-3 py-2 transition-colors ${
                  hoveredAssessmentIndexes.includes(idx)
                    ? 'bg-indigo-100 dark:bg-indigo-900/40'
                    : 'bg-gray-50 dark:bg-slate-700/50'
                }`}
              >
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#6366F1]" />
                {bullet.trim()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

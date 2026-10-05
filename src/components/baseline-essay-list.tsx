'use client';

import { List, CheckCircle, Clock } from 'lucide-react';
import type { EssayMeta } from '@/types';

interface BaselineEssayListProps {
  essays: EssayMeta[];
  onSelectEssay: (essayId: string) => void;
}

export default function BaselineEssayList({ essays, onSelectEssay }: BaselineEssayListProps) {
  const sorted = [...essays].sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
  const gradedCount = sorted.filter((e) => e.gradingStatus === 'graded').length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
          <List className="h-5 w-5 text-indigo-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Essays</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {gradedCount} of {sorted.length} graded — select an essay to begin
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--card-border)]">
        {sorted.map((essay, i) => {
          const isGraded = essay.gradingStatus === 'graded';
          return (
            <button
              key={essay.id}
              onClick={() => onSelectEssay(essay.id)}
              className={`flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--card-bg)] ${
                i > 0 ? 'border-t border-[var(--card-border)]' : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 text-right font-mono text-xs" style={{ color: 'var(--muted)' }}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    {essay.filename}
                  </span>
                  {essay.wordCount != null && (
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {essay.wordCount} words
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {essay.overallGrade !== null && (
                  <span className="text-sm font-bold text-indigo-500">
                    {Math.round(essay.overallGrade * 2 * 10) / 10}/10
                  </span>
                )}
                {isGraded ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Clock className="h-4 w-4" style={{ color: 'var(--muted)' }} />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

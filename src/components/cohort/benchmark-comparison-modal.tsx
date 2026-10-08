'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ActionLogger } from '@/lib/action-logger';
import { detectParagraphBreaks } from '@/lib/essay-paragraphs';

function splitIntoParagraphs(content: string): string[] {
  const breaks = detectParagraphBreaks(content);
  if (breaks.length === 0) return [content];
  const slices: string[] = [];
  let prev = 0;
  for (const b of breaks) {
    slices.push(content.slice(prev, b));
    prev = b;
  }
  slices.push(content.slice(prev));
  return slices;
}

interface EssayDetail {
  id: string;
  filename: string;
  pdf_content: string;
  essay_prompt: string | null;
  summary: string | null;
}

interface GradeDetail {
  criterion_name: string;
  ai_score: number | null;
  teacher_score: number | null;
  ai_justification: string | null;
}

interface LoadedEssay {
  essay: EssayDetail;
  grade: GradeDetail | null;
}

interface CurrentAssessment {
  justification: string | string[];
  aiScore: number | null;
}

export interface BenchmarkComparisonModalProps {
  sessionId: string;
  currentEssayId: string;
  currentAssessment?: CurrentAssessment | null;
  criterionName: string;
  benchmarks: { type: string; essayId: string }[];
  onClose: () => void;
  actionLogger?: ActionLogger | null;
}

// Helpers

function justText(j: string | string[] | null | undefined): string {
  if (!j) return '';
  return Array.isArray(j) ? j.join('\n') : j;
}

async function fetchEssayWithGrades(
  sessionId: string,
  essayId: string,
  criterionName: string,
): Promise<LoadedEssay | null> {
  const res = await fetch(`/api/sessions/${sessionId}/essays/${essayId}`);
  if (!res.ok) return null;
  const data = await res.json();
  const essay: EssayDetail = data.essay;
  const grades: GradeDetail[] = data.grades ?? [];
  const grade = grades.find((g) => g.criterion_name === criterionName) ?? null;
  return { essay, grade };
}

// Essay text pane

function EssayPane({
  label,
  labelColor,
  data,
  isLoading,
}: {
  label: string;
  labelColor: 'indigo' | 'amber';
  data: LoadedEssay | null;
  isLoading: boolean;
}) {
  const tagCls = labelColor === 'indigo'
    ? 'bg-indigo-500/10 text-indigo-500'
    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  const borderCls = labelColor === 'indigo' ? 'border-indigo-500/30' : 'border-[var(--card-border)]';

  return (
    <div className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border ${borderCls} bg-[var(--card-bg)]`}>
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--card-border)] px-4 py-3">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tagCls}`}>
          {label}
        </span>
        {data && (
          <p className="mt-1.5 truncate text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {data.essay.filename}
          </p>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
        ) : !data ? (
          <div className="p-4">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Could not load essay.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-xl px-6 py-6">
            {data.essay.essay_prompt && (
              <div className="mb-5 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-500 dark:bg-amber-950/30">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  Essay Prompt
                </p>
                <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
                  {data.essay.essay_prompt}
                </p>
              </div>
            )}
            {splitIntoParagraphs(data.essay.pdf_content).map((para, i) => (
              <p
                key={i}
                className="mb-4 last:mb-0 whitespace-pre-wrap font-serif text-sm leading-7 text-gray-800 dark:text-slate-200"
              >
                {para}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Right panel

function InfoPanel({
  criterionName,
  benchmarkType,
  benchmarkData,
  benchmarkLoading,
  currentAssessment,
  currentData,
}: {
  criterionName: string;
  benchmarkType: string;
  benchmarkData: LoadedEssay | null;
  benchmarkLoading: boolean;
  currentAssessment?: CurrentAssessment | null;
  currentData: LoadedEssay | null;
}) {
  const bTeacherScore = benchmarkData?.grade?.teacher_score ?? null;
  const bAiScore = benchmarkData?.grade?.ai_score ?? null;
  const bJustification = benchmarkData?.grade?.ai_justification ?? null;

  const cAiScore = currentAssessment?.aiScore ?? currentData?.grade?.ai_score ?? null;
  const cJustification = justText(currentAssessment?.justification) || currentData?.grade?.ai_justification || null;

  return (
    <div
      className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-[var(--card-border)]"
      style={{ background: 'var(--background)' }}
    >
      {/* Criterion badge */}
      <div className="border-b border-[var(--card-border)] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Criterion
        </p>
        <p className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          {criterionName}
        </p>
      </div>

      {/* Benchmark section */}
      <div className="border-b border-[var(--card-border)] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
          Score {benchmarkType} Benchmark
        </p>
        {benchmarkLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--muted)' }} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-3">
              {bTeacherScore !== null && (
                <div className="text-xs">
                  <span style={{ color: 'var(--muted)' }}>Teacher </span>
                  <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-500">
                    {bTeacherScore}
                  </span>
                </div>
              )}
              {bAiScore !== null && (
                <div className="text-xs">
                  <span style={{ color: 'var(--muted)' }}>AI </span>
                  <span className="rounded-md bg-amber-500/10 px-2 py-0.5 font-bold text-amber-600 dark:text-amber-400">
                    {bAiScore}
                  </span>
                </div>
              )}
              {bTeacherScore === null && bAiScore === null && (
                <p className="text-xs italic" style={{ color: 'var(--muted)' }}>No score recorded</p>
              )}
            </div>

            {bJustification ? (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  AI Assessment
                </p>
                <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--foreground)' }}>
                  {bJustification}
                </p>
              </div>
            ) : (
              <p className="text-xs italic" style={{ color: 'var(--muted)' }}>No AI assessment available</p>
            )}
          </>
        )}
      </div>

      {/* Current essay section */}
      <div className="p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-indigo-500">
          Current Essay
        </p>
        <div className="mb-3 flex flex-wrap gap-3">
          {cAiScore !== null && (
            <div className="text-xs">
              <span style={{ color: 'var(--muted)' }}>AI </span>
              <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 font-bold text-indigo-500">
                {cAiScore}
              </span>
            </div>
          )}
          {cAiScore === null && (
            <p className="text-xs italic" style={{ color: 'var(--muted)' }}>Not yet graded</p>
          )}
        </div>
        {cJustification && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              AI Assessment
            </p>
            <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--foreground)' }}>
              {cJustification}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Full-screen view

export default function BenchmarkComparisonModal({
  sessionId,
  currentEssayId,
  currentAssessment,
  criterionName,
  benchmarks,
  onClose,
  actionLogger,
}: BenchmarkComparisonModalProps) {
  const [essayData, setEssayData] = useState<Record<string, LoadedEssay | null>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const sortedBenchmarks = [...benchmarks].sort((a, b) => Number(a.type) - Number(b.type));
  const [selectedBenchmarkIndex, setSelectedBenchmarkIndex] = useState(0);

  useEffect(() => {
    actionLogger?.log('benchmark_comparison_opened', { criterionName });
    return () => { actionLogger?.log('benchmark_comparison_closed', { criterionName }); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ids = [currentEssayId, ...benchmarks.map((b) => b.essayId)];
    const uniqueIds = [...new Set(ids)];
    setLoadingIds(new Set(uniqueIds));

    for (const id of uniqueIds) {
      fetchEssayWithGrades(sessionId, id, criterionName)
        .then((result) => setEssayData((prev) => ({ ...prev, [id]: result })))
        .catch(console.error)
        .finally(() =>
          setLoadingIds((prev) => { const n = new Set(prev); n.delete(id); return n; })
        );
    }
  }, [sessionId, currentEssayId, criterionName, benchmarks]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeBenchmark = sortedBenchmarks[selectedBenchmarkIndex] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--card-border)] px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
              Benchmark Comparison
            </h2>
            <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-500">
              {criterionName}
            </span>
          </div>

          {/* Benchmark selector (only with more than one) */}
          {sortedBenchmarks.length > 1 && (
            <div className="flex items-center gap-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-1">
              <button
                onClick={() => setSelectedBenchmarkIndex((i) => Math.max(0, i - 1))}
                disabled={selectedBenchmarkIndex === 0}
                className="cursor-pointer rounded p-1 transition-colors hover:bg-[var(--background)] disabled:opacity-30"
                style={{ color: 'var(--muted)' }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {sortedBenchmarks.map((b, i) => (
                <button
                  key={b.type}
                  onClick={() => setSelectedBenchmarkIndex(i)}
                  className={`cursor-pointer rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    i === selectedBenchmarkIndex
                      ? 'bg-amber-500 text-white'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                  }`}
                >
                  Score {b.type}
                </button>
              ))}
              <button
                onClick={() => setSelectedBenchmarkIndex((i) => Math.min(sortedBenchmarks.length - 1, i + 1))}
                disabled={selectedBenchmarkIndex === sortedBenchmarks.length - 1}
                className="cursor-pointer rounded p-1 transition-colors hover:bg-[var(--background)] disabled:opacity-30"
                style={{ color: 'var(--muted)' }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-[var(--card-bg)]"
          style={{ color: 'var(--muted)' }}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Essay columns */}
        <div className="flex flex-1 gap-3 overflow-hidden p-4">
          {/* Current essay */}
          <EssayPane
            label="Current Essay"
            labelColor="indigo"
            data={essayData[currentEssayId] ?? null}
            isLoading={loadingIds.has(currentEssayId)}
          />

          {/* Selected benchmark essay */}
          {activeBenchmark && (
            <EssayPane
              label={`Score ${activeBenchmark.type} Benchmark`}
              labelColor="amber"
              data={essayData[activeBenchmark.essayId] ?? null}
              isLoading={loadingIds.has(activeBenchmark.essayId)}
            />
          )}
        </div>

        {/* Right panel: grades + justifications */}
        {activeBenchmark && (
          <InfoPanel
            criterionName={criterionName}
            benchmarkType={activeBenchmark.type}
            benchmarkData={essayData[activeBenchmark.essayId] ?? null}
            benchmarkLoading={loadingIds.has(activeBenchmark.essayId)}
            currentAssessment={currentAssessment}
            currentData={essayData[currentEssayId] ?? null}
          />
        )}
      </div>
    </div>
  );
}

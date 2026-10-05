'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  CheckCircle2,
  Clock,
  Tag,
  ChevronRight,
  BarChart2,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { EssayMeta } from '@/types';
import type { ActionLogger } from '@/lib/action-logger';
import InfoTooltip from '@/components/ui/info-tooltip';

// Inline types — avoids importing server-only db-helpers in client bundle
export interface TopicData {
  id: number;
  topic_index: number;
  keywords: string; // JSON-encoded string[]
  label: string | null;
}

export interface StatsData {
  totalEssays: number;
  gradedEssays: number;
  avgGrade: number | null;
  gradeDistribution: Record<number, number>;
}

interface CohortDashboardProps {
  essays: EssayMeta[];
  topics: TopicData[];
  stats: StatsData;
  sessionId?: string;
  onSelectEssay: (essayId: string) => void;
  actionLogger?: ActionLogger | null;
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function parseKeywords(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function statusBadge(status: string): { label: string; cls: string } {
  if (status === 'graded')  return { label: 'Graded',       cls: 'bg-emerald-500/10 text-emerald-500' };
  if (status === 'grading') return { label: 'In progress',  cls: 'bg-amber-500/10 text-amber-500' };
  return                           { label: 'Not started',  cls: 'bg-[var(--card-bg)] text-[var(--muted)] border border-[var(--card-border)]' };
}

type SortKey = 'filename' | 'grade' | 'wordCount' | 'status' | 'quality';

/* ── Topics panel ─────────────────────────────────────────────────────── */

function TopicsPanel({
  topics,
  essays,
  selectedTopicId,
  onSelect,
  width,
}: {
  topics: TopicData[];
  essays: EssayMeta[];
  selectedTopicId: number | null;
  onSelect: (id: number | null) => void;
  width: number;
}) {
  return (
    <div
      className="flex shrink-0 flex-col overflow-y-auto border-r border-[var(--card-border)]"
      style={{ width }}
    >
      <div className="flex items-center gap-1.5 px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        Topics
        <InfoTooltip
          side="bottom"
          align="start"
          text="Essays are grouped into clusters using BAAI/bge-large-en-v1.5 sentence embeddings, then each cluster is given a short label by an LLM (gemma2:9b). Click a topic to filter the essay list."
        />
      </div>

      {/* All essays */}
      <button
        onClick={() => onSelect(null)}
        className={`flex cursor-pointer items-center gap-2 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-[var(--card-bg)] ${
          selectedTopicId === null ? 'bg-indigo-500/10 font-semibold text-indigo-500 border-l-2 border-indigo-500 pl-[14px] pr-4' : 'border-l-2 border-transparent pl-[14px] pr-4'
        }`}
        style={selectedTopicId !== null ? { color: 'var(--foreground)' } : {}}
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate">All Essays</span>
        <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
          selectedTopicId === null ? 'bg-indigo-500 text-white' : 'bg-[var(--card-bg)] text-[var(--muted)]'
        }`}>
          {essays.length}
        </span>
      </button>

      {/* Per-topic */}
      {topics.length === 0 ? (
        <p className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>No topics yet</p>
      ) : (
        topics.map((topic) => {
          const count   = essays.filter(e => e.topicId === topic.id).length;
          const graded  = essays.filter(e => e.topicId === topic.id && e.gradingStatus === 'graded').length;
          const keywords = parseKeywords(topic.keywords).slice(0, 4);
          const selected = selectedTopicId === topic.id;

          return (
            <button
              key={topic.id}
              onClick={() => onSelect(topic.id)}
              className={`flex cursor-pointer flex-col gap-1.5 py-2.5 text-left transition-colors duration-150 hover:bg-[var(--card-bg)] ${
                selected ? 'bg-indigo-500/10 border-l-2 border-indigo-500 pl-[14px] pr-4' : 'border-l-2 border-transparent pl-[14px] pr-4'
              }`}
            >
              <div className="flex items-center gap-2">
                <Tag className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-indigo-500' : 'text-[var(--muted)]'}`} />
                <span
                  className={`flex-1 truncate text-sm font-medium ${selected ? 'text-indigo-500' : ''}`}
                  style={selected ? {} : { color: 'var(--foreground)' }}
                >
                  {topic.label ?? `Topic ${topic.topic_index + 1}`}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                  selected ? 'bg-indigo-500 text-white' : 'bg-[var(--card-bg)] text-[var(--muted)]'
                }`}>
                  {count}
                </span>
              </div>

              {keywords.length > 0 && (
                <div className="ml-5 flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {keywords.map((kw) => (
                    <span key={kw} className="text-[10px] leading-4" style={{ color: 'var(--muted)' }}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              {count > 0 && (
                <div className="ml-5 h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--card-border)' }}>
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(graded / count) * 100}%` }}
                  />
                </div>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

/* ── Essays panel ─────────────────────────────────────────────────────── */

function EssaysPanel({
  essays,
  topics,
  onSelect,
  onTopicChange,
}: {
  essays: EssayMeta[];
  topics: TopicData[];
  onSelect: (essay: EssayMeta) => void;
  onTopicChange?: (essayId: string, topicId: number | null) => void;
}) {
  const [sortBy, setSortBy] = useState<SortKey>('filename');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      // Numeric sorts default to descending (high → low) since that's the more useful first view.
      const numericKey = key === 'grade' || key === 'wordCount' || key === 'quality';
      setSortDir(numericKey ? 'desc' : 'asc');
    }
  };

  const sorted = [...essays].sort((a, b) => {
    // Nulls-last helper for numeric sorts: unscored essays always go to the bottom
    // regardless of sort direction.
    const nullsLast = (av: number | null | undefined, bv: number | null | undefined): number | null => {
      const aNull = av == null;
      const bNull = bv == null;
      if (aNull && bNull) return 0;
      if (aNull) return 1;   // a goes after b
      if (bNull) return -1;  // b goes after a
      return null;            // both present — caller does numeric compare
    };

    let cmp = 0;
    switch (sortBy) {
      case 'filename':
        cmp = a.filename.localeCompare(b.filename);
        return sortDir === 'asc' ? cmp : -cmp;
      case 'grade': {
        const nl = nullsLast(a.overallGrade, b.overallGrade);
        if (nl !== null) return nl;
        cmp = (a.overallGrade ?? 0) - (b.overallGrade ?? 0);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      case 'wordCount': {
        const nl = nullsLast(a.wordCount, b.wordCount);
        if (nl !== null) return nl;
        cmp = (a.wordCount ?? 0) - (b.wordCount ?? 0);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      case 'quality': {
        const nl = nullsLast(a.avgAiScore, b.avgAiScore);
        if (nl !== null) return nl;
        cmp = (a.avgAiScore ?? 0) - (b.avgAiScore ?? 0);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      case 'status': {
        const order = { graded: 0, grading: 1, pending: 2 } as Record<string, number>;
        cmp = (order[a.gradingStatus] ?? 3) - (order[b.gradingStatus] ?? 3);
        return sortDir === 'asc' ? cmp : -cmp;
      }
    }
    return 0;
  });

  // Direction-meaning labels by sort key — what does asc/desc mean here?
  const dirHint = (k: SortKey, dir: 'asc' | 'desc'): string => {
    if (k === 'filename') return dir === 'asc' ? 'A→Z' : 'Z→A';
    if (k === 'status')   return dir === 'asc' ? 'graded first' : 'pending first';
    // numeric: grade, wordCount, quality
    return dir === 'asc' ? 'low → high' : 'high → low';
  };

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => {
    const active = sortBy === k;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-semibold transition-colors ${
          active
            ? 'bg-indigo-500/10 text-indigo-500'
            : 'text-[var(--muted)] hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]'
        }`}
        title={active ? `${label} · ${dirHint(k, sortDir)}` : `Sort by ${label}`}
      >
        <span>{label}</span>
        {active ? (
          <span className="flex items-center gap-0.5">
            {sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            <span className="text-[10px] font-normal opacity-80">{dirHint(k, sortDir)}</span>
          </span>
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--card-border)] px-6 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          Essays
          <span className="ml-2 font-normal normal-case">{essays.length} shown</span>
        </span>
        <div className="flex items-center gap-0.5">
          <ArrowUpDown className="mr-1 h-3 w-3" style={{ color: 'var(--muted)' }} />
          <SortBtn k="filename" label="Name" />
          <SortBtn k="status" label="Status" />
          <SortBtn k="grade" label="Grade" />
          <SortBtn k="wordCount" label="Words" />
          <SortBtn k="quality" label="Quality" />
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2" style={{ color: 'var(--muted)' }}>
            <FileText className="h-8 w-8 opacity-30" />
            <span className="text-sm">No essays in this topic</span>
          </div>
        ) : (
          sorted.map((essay) => {
            const badge = statusBadge(essay.gradingStatus);
            const currentTopic = topics.find((t) => t.id === essay.topicId);
            return (
              <div
                key={essay.id}
                className="group rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] transition-all duration-200 hover:border-indigo-500/50 hover:shadow-md"
              >
                {/* Clickable main area */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(essay)}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect(essay)}
                  className="flex cursor-pointer items-start gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                        {essay.filename}
                      </span>
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {essay.overallGrade !== null && (
                        <span className="shrink-0 rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-bold text-indigo-500">
                          {(essay.overallGrade * 2).toFixed(1)} / 10
                        </span>
                      )}
                    </div>

                    {essay.summary && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                        {essay.summary}
                      </p>
                    )}

                    {essay.wordCount != null && (
                      <div className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                        {essay.wordCount} words
                      </div>
                    )}
                  </div>

                  <ChevronRight
                    className="mt-0.5 h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: 'var(--muted)' }}
                  />
                </div>

                {/* Topic reassignment row — only when topics exist */}
                {topics.length > 0 && onTopicChange && (
                  <div
                    className="flex items-center gap-2 border-t border-[var(--card-border)] px-4 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tag className="h-3 w-3 shrink-0" style={{ color: 'var(--muted)' }} />
                    <select
                      value={essay.topicId ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        onTopicChange(essay.id, val === '' ? null : Number(val));
                      }}
                      className="cursor-pointer flex-1 rounded border border-[var(--card-border)] bg-[var(--background)] px-2 py-0.5 text-[11px] font-medium outline-none transition-colors focus:border-indigo-500"
                      style={{ color: currentTopic ? 'var(--foreground)' : 'var(--muted)' }}
                    >
                      <option value="">No topic</option>
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label ?? `Topic ${t.topic_index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Stats panel ──────────────────────────────────────────────────────── */

function StatsPanel({
  stats,
  essays,
  topics,
}: {
  stats: StatsData;
  essays: EssayMeta[];
  topics: TopicData[];
}) {
  const [view, setView] = useState<'overall' | 'bytopic'>('overall');

  const progressPct = stats.totalEssays > 0 ? (stats.gradedEssays / stats.totalEssays) * 100 : 0;

  const sortedBuckets = Object.entries(stats.gradeDistribution)
    .map(([k, v]) => ({ bucket: Number(k), count: v }))
    .sort((a, b) => a.bucket - b.bucket);
  const maxCount = sortedBuckets.reduce((m, b) => Math.max(m, b.count), 0);

  const topicRows = topics.map((topic) => {
    const topicEssays = essays.filter(e => e.topicId === topic.id);
    const graded = topicEssays.filter(e => e.gradingStatus === 'graded');
    const grades = graded.map(e => e.overallGrade).filter((g): g is number => g !== null);
    const avg = grades.length > 0 ? grades.reduce((s, g) => s + g, 0) / grades.length : null;
    return { topic, count: topicEssays.length, gradedCount: graded.length, avg };
  });

  const TabBtn = ({ v, label }: { v: 'overall' | 'bytopic'; label: string }) => (
    <button
      onClick={() => setView(v)}
      className={`cursor-pointer flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
        view === v
          ? 'bg-indigo-500 text-white'
          : 'text-[var(--muted)] hover:text-[var(--foreground)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex w-64 shrink-0 flex-col overflow-hidden border-l border-[var(--card-border)]">
      {/* Tab toggle */}
      <div className="flex shrink-0 gap-1 border-b border-[var(--card-border)] p-2">
        <TabBtn v="overall" label="Overall" />
        <TabBtn v="bytopic" label="By Topic" />
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        {view === 'overall' ? (
          <>
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-500" />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Progress
                </span>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                  {stats.gradedEssays}
                  <span className="ml-1 text-sm font-normal" style={{ color: 'var(--muted)' }}>
                    / {stats.totalEssays}
                  </span>
                </span>
                <span className="text-sm font-semibold text-indigo-500">{Math.round(progressPct)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--card-border)' }}>
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Avg grade */}
            {stats.avgGrade !== null && (
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Average Grade
                </div>
                <div className="text-2xl font-bold text-emerald-500">
                  {(stats.avgGrade * 2).toFixed(1)}
                  <span className="ml-1 text-sm font-normal" style={{ color: 'var(--muted)' }}>
                    / 10
                  </span>
                </div>
              </div>
            )}

            {/* Grade distribution */}
            {sortedBuckets.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-indigo-500" />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                    Distribution
                  </span>
                </div>
                <div className="space-y-1.5">
                  {sortedBuckets.map(({ bucket, count }) => (
                    <div key={bucket} className="flex items-center gap-2">
                      <span className="w-8 shrink-0 text-right text-xs font-mono" style={{ color: 'var(--muted)' }}>
                        {bucket}
                      </span>
                      <div
                        className="h-4 flex-1 overflow-hidden rounded-sm"
                        style={{ background: 'var(--card-border)' }}
                      >
                        <div
                          className="h-full rounded-sm bg-indigo-500 transition-all duration-300"
                          style={{ width: maxCount > 0 ? `${(count / maxCount) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="w-4 shrink-0 text-xs" style={{ color: 'var(--muted)' }}>
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* By Topic view */
          topics.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>No topics yet. Run processing to generate topics.</p>
          ) : (
            <div className="space-y-3">
              {topicRows.map(({ topic, count, gradedCount, avg }) => {
                const pct = count > 0 ? (gradedCount / count) * 100 : 0;
                return (
                  <div key={topic.id} className="space-y-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3">
                    <div className="truncate text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
                      {topic.label ?? `Topic ${topic.topic_index + 1}`}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--muted)' }}>
                        {gradedCount}/{count} graded
                      </span>
                      {avg !== null && (
                        <span className="font-bold text-emerald-500">
                          avg {(avg * 2).toFixed(1)} / 10
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--card-border)' }}>
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/* ── Main export ──────────────────────────────────────────────────────── */

export default function CohortDashboard({
  essays,
  topics,
  stats,
  sessionId,
  onSelectEssay,
  actionLogger,
}: CohortDashboardProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [topicsWidth, setTopicsWidth] = useState(256);
  // Optimistic overrides for topic reassignment (essayId → topicId | null)
  const [topicOverrides, setTopicOverrides] = useState<Record<string, number | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    actionLogger?.log('dashboard_viewed');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setTopicsWidth(Math.min(480, Math.max(160, ev.clientX - rect.left)));
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Apply local topic overrides for immediate UI feedback
  const essaysWithOverrides = essays.map((e) =>
    Object.prototype.hasOwnProperty.call(topicOverrides, e.id)
      ? { ...e, topicId: topicOverrides[e.id] }
      : e
  );

  const filteredEssays = (
    selectedTopicId === null
      ? essaysWithOverrides
      : essaysWithOverrides.filter((e) => e.topicId === selectedTopicId)
  ).filter((e) => (e.wordCount == null || e.wordCount > 0) && e.content);

  const handleTopicSelect = (id: number | null) => {
    setSelectedTopicId(id);
    if (id !== null) actionLogger?.log('topic_selected', { topicId: id });
  };

  const handleTopicChange = useCallback((essayId: string, newTopicId: number | null) => {
    setTopicOverrides((prev) => ({ ...prev, [essayId]: newTopicId }));
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}/essays/${essayId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic_id: newTopicId, topic_manually_reassigned: true }),
    }).catch(console.error);
    actionLogger?.log('topic_manually_reassigned', { essayId, topicId: newTopicId });
  }, [sessionId, actionLogger]);

  return (
    <div
      className="flex flex-col"
      style={{ height: 'calc(100vh - 88px)', background: 'var(--background)' }}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--card-border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
              Cohort Overview
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
              Select an essay below to begin grading
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--muted)' }}>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              {stats.gradedEssays} graded
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              {stats.totalEssays - stats.gradedEssays} remaining
            </span>
          </div>
        </div>
      </div>

      {/* Three columns */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        <TopicsPanel
          topics={topics}
          essays={essaysWithOverrides}
          selectedTopicId={selectedTopicId}
          onSelect={handleTopicSelect}
          width={topicsWidth}
        />

        {/* Resize divider */}
        <div
          onMouseDown={handleDividerMouseDown}
          className="group relative z-10 flex w-1.5 cursor-col-resize items-center justify-center bg-[var(--card-border)] transition-colors hover:bg-indigo-500/40"
        >
          <div className="h-8 w-1 rounded-full bg-gray-300 group-hover:bg-indigo-500 dark:bg-slate-600" />
        </div>

        <EssaysPanel
          essays={filteredEssays}
          topics={topics}
          onSelect={(essay) => onSelectEssay(essay.id)}
          onTopicChange={handleTopicChange}
        />
        <StatsPanel stats={stats} essays={essaysWithOverrides} topics={topics} />
      </div>
    </div>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Clock, AlertTriangle, Download, Database, BarChart3,
  TrendingUp, AlertOctagon, Percent, Timer, GitCompare, Scale, Target,
} from 'lucide-react';
import type { GradeRecord } from '@/types';
import RankingChart from './ranking-chart';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface AnalyticsDashboardProps {
  records: GradeRecord[];
  teacherName: string;
  onDownloadCSV: () => void;
  sessionId?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers & animation
// ---------------------------------------------------------------------------
const fmt = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const fade = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0, 0, 0.2, 1] as [number, number, number, number] } } };
const slide = {
  initial: { opacity: 0, x: 12 }, animate: { opacity: 1, x: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.15 } },
};

const TABS = [
  { id: 'session' as const, label: 'Session Data', icon: <Database className="h-4 w-4" /> },
  { id: 'overview' as const, label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'agreement' as const, label: 'Agreement', icon: <GitCompare className="h-4 w-4" /> },
  { id: 'rankings' as const, label: 'Rankings', icon: <TrendingUp className="h-4 w-4" /> },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Reusable stat card
function StatCard({ label, value, icon, gradient, subtitle }: { label: string; value: string; icon: React.ReactNode; gradient: string; subtitle?: string }) {
  return (
    <motion.div variants={fade} className="flex items-center gap-4 rounded-xl p-5 shadow-sm"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>{value}</p>
        <p className="truncate text-sm" style={{ color: 'var(--muted)' }}>{label}</p>
        {subtitle && <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Session Data Tab
// ---------------------------------------------------------------------------
function SessionDataTab({ records, onDownloadCSV }: { records: GradeRecord[]; onDownloadCSV: () => void }) {
  const stats = useMemo(() => {
    const n = records.length;
    const times = records.map(r => r.time_spent_seconds).filter((t): t is number => t !== null);
    const avgTime = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const det = records.reduce((s, r) => s + r.hallucinations_detected, 0);
    const conf = records.reduce((s, r) => s + r.hallucinations_confirmed, 0);
    return { n, avgTime, det, conf, rate: n ? ((det / n) * 100).toFixed(1) : '0.0' };
  }, [records]);

  if (!records.length) {
    return (
      <motion.div variants={fade} initial="hidden" animate="visible"
        className="flex flex-col items-center justify-center rounded-xl py-20 text-center"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <Database className="mb-4 h-12 w-12" style={{ color: 'var(--muted)' }} />
        <p className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
          No grading data recorded yet. Start grading to see your session data here.
        </p>
      </motion.div>
    );
  }

  const headers = ['Timestamp', 'Essay ID', 'Criterion', 'Teacher', 'AI', 'Revised AI', 'Time (s)', 'H. Det', 'H. Conf', 'H. Rep', 'Action'];

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Records" value={String(stats.n)} icon={<FileText className="h-5 w-5 text-white" />} gradient="from-indigo-500 to-indigo-600" />
        <StatCard label="Avg Time / Criterion" value={fmt(stats.avgTime)} icon={<Clock className="h-5 w-5 text-white" />} gradient="from-purple-500 to-purple-600" />
        <StatCard label="Hallucination Rate" value={`${stats.rate}%`} icon={<AlertTriangle className="h-5 w-5 text-white" />} gradient="from-amber-500 to-orange-500" />
        <StatCard label="Confirmed Hallucinations" value={String(stats.conf)} icon={<AlertOctagon className="h-5 w-5 text-white" />} gradient="from-red-500 to-red-600" />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Showing {records.length} record{records.length !== 1 ? 's' : ''}</p>
        <button onClick={onDownloadCSV}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
          style={{ background: '#10B981' }}>
          <Download className="h-4 w-4" /> Download CSV
        </button>
      </div>

      <motion.div variants={fade} className="overflow-hidden rounded-xl shadow-sm"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--card-border)' }}>
                {headers.map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={`${r.timestamp}-${r.criterion_id}-${i}`} className="border-b transition-colors duration-150"
                  style={{ borderColor: 'var(--card-border)', background: i % 2 === 1 ? 'var(--background)' : 'transparent' }}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--muted)' }}>{new Date(r.timestamp).toLocaleTimeString()}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-semibold" style={{ color: '#6366F1' }}>{r.essay_id}</td>
                  <td className="max-w-[160px] truncate px-4 py-2.5" style={{ color: 'var(--foreground)' }} title={r.criterion_name}>{r.criterion_name}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-center" style={{ color: 'var(--foreground)' }}>{r.teacher_score ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-center" style={{ color: 'var(--foreground)' }}>{r.ai_score ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-center" style={{ color: 'var(--foreground)' }}>{r.revised_ai_score ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-center" style={{ color: 'var(--muted)' }}>{r.time_spent_seconds ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-center" style={{ color: 'var(--foreground)' }}>{r.hallucinations_detected}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-center" style={{ color: 'var(--foreground)' }}>{r.hallucinations_confirmed}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-center" style={{ color: 'var(--foreground)' }}>{r.hallucinations_reported}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366F1' }}>{r.action_type}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab (data-driven from records)
// ---------------------------------------------------------------------------
function OverviewTab({ records }: { records: GradeRecord[] }) {
  const stats = useMemo(() => {
    const essayIds = [...new Set(records.map(r => r.essay_id))];
    const times = records.map(r => r.time_spent_seconds).filter((t): t is number => t !== null);
    const totalTime = times.reduce((a, b) => a + b, 0);
    const avgTimePerEssay = essayIds.length ? Math.round(totalTime / essayIds.length) : 0;
    const avgTimePerCriterion = times.length ? Math.round(totalTime / times.length) : 0;

    const adjustments = records.filter(r => r.ai_score !== null && r.teacher_score !== null);
    const avgAdj = adjustments.length
      ? (adjustments.reduce((s, r) => s + ((r.teacher_score ?? 0) - (r.ai_score ?? 0)), 0) / adjustments.length).toFixed(1)
      : '0.0';

    // Score revision rate: how often teacher revised the AI score
    const revisedCount = records.filter(r => r.revised_ai_score !== null).length;
    const revisionRate = records.length ? ((revisedCount / records.length) * 100).toFixed(0) : '0';

    const totalH = records.reduce((s, r) => s + r.hallucinations_detected, 0);
    const totalConf = records.reduce((s, r) => s + r.hallucinations_confirmed, 0);
    const totalRep = records.reduce((s, r) => s + r.hallucinations_reported, 0);

    // Per-criterion stats (aggregate across all essays)
    const criterionMap = new Map<string, { aiScores: number[]; teacherScores: number[]; times: number[]; hDetected: number; count: number }>();
    for (const r of records) {
      if (!criterionMap.has(r.criterion_name)) {
        criterionMap.set(r.criterion_name, { aiScores: [], teacherScores: [], times: [], hDetected: 0, count: 0 });
      }
      const c = criterionMap.get(r.criterion_name)!;
      if (r.ai_score !== null) c.aiScores.push(r.ai_score);
      if (r.teacher_score !== null) c.teacherScores.push(r.teacher_score);
      if (r.time_spent_seconds !== null) c.times.push(r.time_spent_seconds);
      c.hDetected += r.hallucinations_detected;
      c.count++;
    }

    const criterionStats = [...criterionMap.entries()].map(([name, d]) => ({
      name,
      avgAi: d.aiScores.length ? +(d.aiScores.reduce((a, b) => a + b, 0) / d.aiScores.length).toFixed(1) : null,
      avgTeacher: d.teacherScores.length ? +(d.teacherScores.reduce((a, b) => a + b, 0) / d.teacherScores.length).toFixed(1) : null,
      avgTime: d.times.length ? Math.round(d.times.reduce((a, b) => a + b, 0) / d.times.length) : 0,
      hDetected: d.hDetected,
      count: d.count,
    }));

    // Group records by essay
    const byEssay = essayIds.map(id => {
      const essayRecords = records.filter(r => r.essay_id === id);
      const essayTimes = essayRecords.map(r => r.time_spent_seconds).filter((t): t is number => t !== null);
      return {
        id,
        criteria: essayRecords.map((r, i) => ({
          name: r.criterion_name,
          idx: i,
          aiScore: r.ai_score,
          teacherScore: r.teacher_score,
          revisedAiScore: r.revised_ai_score,
        })),
        hallucinations: essayRecords.reduce((s, r) => s + r.hallucinations_detected, 0),
        confirmed: essayRecords.reduce((s, r) => s + r.hallucinations_confirmed, 0),
        reported: essayRecords.reduce((s, r) => s + r.hallucinations_reported, 0),
        totalTime: essayTimes.reduce((a, b) => a + b, 0),
        criteriaCount: essayRecords.length,
      };
    });

    return { essayCount: essayIds.length, avgTimePerEssay, avgTimePerCriterion, avgAdj, totalH, totalConf, totalRep, revisionRate, byEssay, criterionStats, totalTime };
  }, [records]);

  if (!records.length) {
    return (
      <motion.div variants={fade} initial="hidden" animate="visible"
        className="flex flex-col items-center justify-center rounded-xl py-20 text-center"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <BarChart3 className="mb-4 h-12 w-12" style={{ color: 'var(--muted)' }} />
        <p className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
          No grading data yet. Complete some grading sessions to see analytics here.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      {/* Top-level stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Essays Graded" value={String(stats.essayCount)} icon={<FileText className="h-5 w-5 text-white" />} gradient="from-blue-500 to-blue-600" />
        <StatCard label="Avg Time / Essay" value={fmt(stats.avgTimePerEssay)} icon={<Clock className="h-5 w-5 text-white" />} gradient="from-purple-500 to-purple-600" subtitle={`Total: ${fmt(stats.totalTime)}`} />
        <StatCard label="Avg Score Adjustment" value={`${+stats.avgAdj >= 0 ? '+' : ''}${stats.avgAdj}`} icon={<TrendingUp className="h-5 w-5 text-white" />} gradient="from-emerald-500 to-emerald-600" subtitle={`Revision rate: ${stats.revisionRate}%`} />
        <StatCard label="Hallucinations Found" value={String(stats.totalH)} icon={<AlertTriangle className="h-5 w-5 text-white" />} gradient="from-amber-500 to-orange-500" subtitle={`${stats.totalConf} confirmed, ${stats.totalRep} reported`} />
      </div>

      {/* Per-criterion aggregate stats */}
      <motion.div variants={fade} className="rounded-xl shadow-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: 'var(--card-border)' }}>
          <Target className="h-5 w-5" style={{ color: '#6366F1' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Criterion-Level Averages</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--card-border)' }}>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Criterion</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Avg AI</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Avg Teacher</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Difference</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Avg Time</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Hallucinations</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Samples</th>
              </tr>
            </thead>
            <tbody>
              {stats.criterionStats.map((c, i) => {
                const diff = c.avgTeacher !== null && c.avgAi !== null ? +(c.avgTeacher - c.avgAi).toFixed(1) : null;
                return (
                  <tr key={`${c.name}-${i}`} className="border-b transition-colors duration-150"
                    style={{ borderColor: 'var(--card-border)', background: i % 2 === 1 ? 'var(--background)' : 'transparent' }}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--foreground)' }}>{c.name}</td>
                    <td className="px-5 py-3 text-center font-mono text-sm" style={{ color: '#818CF8' }}>{c.avgAi ?? '-'}</td>
                    <td className="px-5 py-3 text-center font-mono text-sm" style={{ color: '#6366F1' }}>{c.avgTeacher ?? '-'}</td>
                    <td className="px-5 py-3 text-center font-mono text-sm" style={{ color: diff !== null ? (diff > 0 ? '#10B981' : diff < 0 ? '#EF4444' : 'var(--muted)') : 'var(--muted)' }}>
                      {diff !== null ? `${diff > 0 ? '+' : ''}${diff}` : '-'}
                    </td>
                    <td className="px-5 py-3 text-center font-mono text-xs" style={{ color: 'var(--muted)' }}>{fmt(c.avgTime)}</td>
                    <td className="px-5 py-3 text-center">
                      {c.hDetected > 0 ? (
                        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{c.hDetected}</span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>0</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center text-xs" style={{ color: 'var(--muted)' }}>{c.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Score comparison per essay */}
      <motion.div variants={fade} className="rounded-xl shadow-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: 'var(--card-border)' }}>
          <BarChart3 className="h-5 w-5" style={{ color: '#6366F1' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Per-Essay Score Breakdown</h2>
        </div>
        <div className="space-y-6 p-6">
          {stats.byEssay.map(essay => (
            <div key={essay.id}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-semibold" style={{ color: '#6366F1' }}>{essay.id}</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {essay.criteriaCount} criteria &middot; {fmt(essay.totalTime)}
                </span>
              </div>
              <div className="space-y-1.5">
                {essay.criteria.map(c => {
                  const maxScore = 10;
                  const ai = c.revisedAiScore ?? c.aiScore ?? 0;
                  const teacher = c.teacherScore ?? 0;
                  return (
                    <div key={`${essay.id}-${c.name}-${c.idx}`} className="flex items-center gap-3 text-xs">
                      <span className="w-32 shrink-0 truncate" style={{ color: 'var(--muted)' }}>{c.name}</span>
                      <div className="flex h-4 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--background)' }}>
                        <div className="h-full rounded-full bg-indigo-400/60" style={{ width: `${(ai / maxScore) * 100}%` }} />
                      </div>
                      <span className="w-6 text-right font-mono" style={{ color: 'var(--muted)' }}>{ai}</span>
                      <div className="flex h-4 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--background)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(teacher / maxScore) * 100}%`, background: '#10B981' }} />
                      </div>
                      <span className="w-6 text-right font-mono" style={{ color: 'var(--foreground)' }}>{teacher || '-'}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-4 text-[10px]" style={{ color: 'var(--muted)' }}>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-indigo-400/60" /> AI Score</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: '#10B981' }} /> Teacher Score</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Hallucination summary per essay */}
      <motion.div variants={fade} className="rounded-xl shadow-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: 'var(--card-border)' }}>
          <AlertOctagon className="h-5 w-5" style={{ color: '#6366F1' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Hallucination Summary</h2>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {stats.byEssay.map(essay => (
              <div key={essay.id} className="flex items-center gap-4 rounded-lg p-3"
                style={{ background: 'var(--background)', border: '1px solid var(--card-border)' }}>
                <span className="font-mono text-xs font-semibold" style={{ color: '#6366F1' }}>{essay.id}</span>
                <div className="flex flex-1 items-center gap-4 text-xs" style={{ color: 'var(--muted)' }}>
                  <span><span className="font-semibold" style={{ color: 'var(--foreground)' }}>{essay.hallucinations}</span> detected</span>
                  <span><span className="font-semibold" style={{ color: 'var(--foreground)' }}>{essay.confirmed}</span> confirmed</span>
                  <span><span className="font-semibold" style={{ color: 'var(--foreground)' }}>{essay.reported}</span> reported</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Time distribution per essay */}
      <motion.div variants={fade} className="rounded-xl shadow-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: 'var(--card-border)' }}>
          <Timer className="h-5 w-5" style={{ color: '#6366F1' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Time Distribution</h2>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {stats.byEssay.map(essay => {
              const maxTime = Math.max(...stats.byEssay.map(e => e.totalTime), 1);
              return (
                <div key={essay.id} className="flex items-center gap-4">
                  <span className="w-40 shrink-0 truncate font-mono text-xs font-semibold" style={{ color: '#6366F1' }}>{essay.id}</span>
                  <div className="flex h-6 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--background)' }}>
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${(essay.totalTime / maxTime) * 100}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="w-16 text-right font-mono text-xs" style={{ color: 'var(--muted)' }}>{fmt(essay.totalTime)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Agreement Tab — Inter-rater agreement analysis (teacher vs AI)
// ---------------------------------------------------------------------------
function AgreementTab({ records }: { records: GradeRecord[] }) {
  const analysis = useMemo(() => {
    const paired = records.filter(r => r.teacher_score !== null && r.ai_score !== null);
    if (!paired.length) return null;

    // Score differences
    const diffs = paired.map(r => (r.teacher_score ?? 0) - (r.ai_score ?? 0));
    const absDiffs = diffs.map(Math.abs);
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const meanAbsDiff = absDiffs.reduce((a, b) => a + b, 0) / absDiffs.length;

    // Standard deviation of differences
    const variance = diffs.reduce((s, d) => s + (d - meanDiff) ** 2, 0) / diffs.length;
    const stdDev = Math.sqrt(variance);

    // Exact agreement rate (same score)
    const exactMatch = paired.filter(r => r.teacher_score === r.ai_score).length;
    const exactRate = ((exactMatch / paired.length) * 100).toFixed(1);

    // Adjacent agreement (within 1 point)
    const adjacent = paired.filter(r => Math.abs((r.teacher_score ?? 0) - (r.ai_score ?? 0)) <= 1).length;
    const adjacentRate = ((adjacent / paired.length) * 100).toFixed(1);

    // Direction of disagreement
    const teacherHigher = diffs.filter(d => d > 0).length;
    const aiHigher = diffs.filter(d => d < 0).length;
    const equal = diffs.filter(d => d === 0).length;

    // Distribution of differences
    const diffDistribution = new Map<number, number>();
    for (const d of diffs) {
      diffDistribution.set(d, (diffDistribution.get(d) ?? 0) + 1);
    }
    const sortedDiffs = [...diffDistribution.entries()].sort((a, b) => a[0] - b[0]);

    // Per-essay agreement
    const essayIds = [...new Set(paired.map(r => r.essay_id))];
    const perEssay = essayIds.map(id => {
      const er = paired.filter(r => r.essay_id === id);
      const eDiffs = er.map(r => (r.teacher_score ?? 0) - (r.ai_score ?? 0));
      const eAbsDiffs = eDiffs.map(Math.abs);
      const eMean = eDiffs.reduce((a, b) => a + b, 0) / eDiffs.length;
      const eExact = er.filter(r => r.teacher_score === r.ai_score).length;
      return {
        id,
        count: er.length,
        meanDiff: +eMean.toFixed(2),
        meanAbsDiff: +(eAbsDiffs.reduce((a, b) => a + b, 0) / eAbsDiffs.length).toFixed(2),
        exactRate: +((eExact / er.length) * 100).toFixed(1),
      };
    });

    return {
      n: paired.length,
      meanDiff: +meanDiff.toFixed(2),
      meanAbsDiff: +meanAbsDiff.toFixed(2),
      stdDev: +stdDev.toFixed(2),
      exactRate,
      adjacentRate,
      teacherHigher,
      aiHigher,
      equal,
      sortedDiffs,
      perEssay,
    };
  }, [records]);

  if (!analysis) {
    return (
      <motion.div variants={fade} initial="hidden" animate="visible"
        className="flex flex-col items-center justify-center rounded-xl py-20 text-center"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <Scale className="mb-4 h-12 w-12" style={{ color: 'var(--muted)' }} />
        <p className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
          No paired scores yet. Both teacher and AI scores are needed for agreement analysis.
        </p>
      </motion.div>
    );
  }

  const maxDiffCount = Math.max(...analysis.sortedDiffs.map(d => d[1]), 1);

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      {/* Agreement stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Exact Agreement" value={`${analysis.exactRate}%`} icon={<Target className="h-5 w-5 text-white" />} gradient="from-emerald-500 to-emerald-600" subtitle={`${analysis.n} paired scores`} />
        <StatCard label="Adjacent Agreement" value={`${analysis.adjacentRate}%`} icon={<Percent className="h-5 w-5 text-white" />} gradient="from-blue-500 to-blue-600" subtitle="Within 1 point" />
        <StatCard label="Mean Difference" value={`${analysis.meanDiff >= 0 ? '+' : ''}${analysis.meanDiff}`} icon={<TrendingUp className="h-5 w-5 text-white" />} gradient="from-indigo-500 to-indigo-600" subtitle={`SD: ${analysis.stdDev}`} />
        <StatCard label="Mean |Difference|" value={String(analysis.meanAbsDiff)} icon={<Scale className="h-5 w-5 text-white" />} gradient="from-purple-500 to-purple-600" subtitle="Absolute gap" />
      </div>

      {/* Direction of disagreement */}
      <motion.div variants={fade} className="rounded-xl shadow-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: 'var(--card-border)' }}>
          <GitCompare className="h-5 w-5" style={{ color: '#6366F1' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Disagreement Direction</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
                <span>Teacher scored higher</span>
                <span className="font-mono font-semibold" style={{ color: '#10B981' }}>{analysis.teacherHigher}</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full" style={{ background: 'var(--background)' }}>
                <div className="h-full rounded-full" style={{ width: `${(analysis.teacherHigher / analysis.n) * 100}%`, background: '#10B981' }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
                <span>AI scored higher</span>
                <span className="font-mono font-semibold" style={{ color: '#818CF8' }}>{analysis.aiHigher}</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full" style={{ background: 'var(--background)' }}>
                <div className="h-full rounded-full" style={{ width: `${(analysis.aiHigher / analysis.n) * 100}%`, background: '#818CF8' }} />
              </div>
            </div>
            <div className="w-24 text-center">
              <div className="mb-1 text-xs" style={{ color: 'var(--muted)' }}>Equal</div>
              <span className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{analysis.equal}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Score difference distribution */}
      <motion.div variants={fade} className="rounded-xl shadow-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: 'var(--card-border)' }}>
          <BarChart3 className="h-5 w-5" style={{ color: '#6366F1' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Score Difference Distribution</h2>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>(Teacher - AI)</span>
        </div>
        <div className="p-6">
          <div className="flex items-end gap-1" style={{ height: '120px' }}>
            {analysis.sortedDiffs.map(([diff, count]) => (
              <div key={diff} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{count}</span>
                <motion.div
                  className="w-full rounded-t"
                  style={{
                    background: diff === 0 ? '#10B981' : diff > 0 ? '#6366F1' : '#818CF8',
                    minHeight: '4px',
                  }}
                  initial={{ height: 0 }}
                  animate={{ height: `${(count / maxDiffCount) * 80}px` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
                <span className="text-[10px] font-mono" style={{ color: 'var(--foreground)' }}>{diff > 0 ? `+${diff}` : diff}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Per-essay agreement table */}
      <motion.div variants={fade} className="rounded-xl shadow-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: 'var(--card-border)' }}>
          <FileText className="h-5 w-5" style={{ color: '#6366F1' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Per-Essay Agreement</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--card-border)' }}>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Essay</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Criteria</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Exact Match</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Mean Diff</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Mean |Diff|</th>
              </tr>
            </thead>
            <tbody>
              {analysis.perEssay.map((e, i) => (
                <tr key={e.id} className="border-b transition-colors duration-150"
                  style={{ borderColor: 'var(--card-border)', background: i % 2 === 1 ? 'var(--background)' : 'transparent' }}>
                  <td className="px-5 py-3 font-mono text-xs font-semibold" style={{ color: '#6366F1' }}>{e.id}</td>
                  <td className="px-5 py-3 text-center" style={{ color: 'var(--foreground)' }}>{e.count}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: e.exactRate >= 50 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: e.exactRate >= 50 ? '#10B981' : '#F59E0B' }}>
                      {e.exactRate}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center font-mono text-sm" style={{ color: e.meanDiff > 0 ? '#10B981' : e.meanDiff < 0 ? '#EF4444' : 'var(--muted)' }}>
                    {e.meanDiff > 0 ? '+' : ''}{e.meanDiff}
                  </td>
                  <td className="px-5 py-3 text-center font-mono text-sm" style={{ color: 'var(--foreground)' }}>{e.meanAbsDiff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function AnalyticsDashboard({ records, teacherName, onDownloadCSV, sessionId }: AnalyticsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('session');

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
            Analytics Dashboard
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Session data for <span className="font-medium" style={{ color: 'var(--foreground)' }}>{teacherName}</span>
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="relative flex gap-1 rounded-lg p-1" style={{ background: 'var(--background)', border: '1px solid var(--card-border)' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="relative z-10 flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200"
            style={{ color: activeTab === tab.id ? '#6366F1' : 'var(--muted)' }}>
            {activeTab === tab.id && (
              <motion.div layoutId="tab-indicator" className="absolute inset-0 rounded-md shadow-sm"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
            )}
            <span className="relative z-10 flex items-center gap-2">{tab.icon}{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'session' && (
          <motion.div key="session" {...slide}><SessionDataTab records={records} onDownloadCSV={onDownloadCSV} /></motion.div>
        )}
        {activeTab === 'overview' && (
          <motion.div key="overview" {...slide}><OverviewTab records={records} /></motion.div>
        )}
        {activeTab === 'agreement' && (
          <motion.div key="agreement" {...slide}><AgreementTab records={records} /></motion.div>
        )}
        {activeTab === 'rankings' && sessionId && (
          <motion.div key="rankings" {...slide}><RankingChart sessionId={sessionId} /></motion.div>
        )}
        {activeTab === 'rankings' && !sessionId && (
          <motion.div key="rankings-no-session" {...slide}>
            <div className="flex flex-col items-center justify-center rounded-xl py-20 text-center"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <TrendingUp className="mb-4 h-12 w-12" style={{ color: 'var(--muted)' }} />
              <p className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>No active session.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

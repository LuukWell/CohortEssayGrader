'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import type { ActionLogger } from '@/lib/action-logger';

interface ProcessingScreenProps {
  sessionId: string;
  onComplete: () => void;
  actionLogger?: ActionLogger | null;
  /** Whether to run the DC pipeline (summaries/topics/embeddings). False for baseline-only precompute. */
  forDashboard?: boolean;
  /** Whether to also run grade precomputation (stage D). */
  precomputeGrades?: boolean;
}

type ProcessingStatus = 'processing' | 'summarising' | 'topics' | 'similarities' | 'precomputing' | 'complete' | 'error';

interface Progress { total: number; summarised: number; topics: number; similarities: number; precomputed: number; }

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  processing:   'Starting up…',
  summarising:  'Summarising essays',
  topics:       'Identifying topics',
  similarities: 'Computing similarities',
  precomputing: 'Grading essays with AI',
  complete:     'Done!',
  error:        'Processing failed.',
};

const ORDERED_DASHBOARD: ProcessingStatus[] = ['processing', 'summarising', 'topics', 'similarities', 'complete'];
const ORDERED_PRECOMPUTE_ONLY: ProcessingStatus[] = ['processing', 'precomputing', 'complete'];

export default function ProcessingScreen({ sessionId, onComplete, actionLogger, forDashboard = true, precomputeGrades = false }: ProcessingScreenProps) {
  const [status, setStatus] = useState<ProcessingStatus>('processing');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ORDERED = forDashboard ? ORDERED_DASHBOARD : ORDERED_PRECOMPUTE_ONLY;

  async function runPrecompute(): Promise<void> {
    setStatus('precomputing');
    await fetch(`/api/sessions/${sessionId}/precompute`, { method: 'POST' });
    // Poll until grades_precomputed = true
    await new Promise<void>((resolve, reject) => {
      const iv = setInterval(async () => {
        try {
          const r = await fetch(`/api/sessions/${sessionId}/precompute`);
          const d = await r.json();
          if (d.grades_precomputed || !d.running) {
            clearInterval(iv);
            resolve();
          }
          // Update essay-count progress if available
          const sr = await fetch(`/api/sessions/${sessionId}`);
          const sd = await sr.json();
          if (sd.progress) setProgress((prev) => ({ ...(prev ?? { total: 0, summarised: 0, topics: 0, similarities: 0, precomputed: 0 }), ...sd.progress }));
        } catch {
          clearInterval(iv);
          reject(new Error('Precompute polling failed'));
        }
      }, 2000);
    });
  }

  // Trigger processing once, then poll
  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    actionLogger?.log('processing_started');

    const run = async () => {
      if (forDashboard) {
        const r = await fetch(`/api/sessions/${sessionId}/process`, { method: 'POST' });
        const data = await r.json();
        if (data.status !== 'complete') {
          await waitForDashboardPipeline();
        }
      }
      if (precomputeGrades) {
        await runPrecompute();
      }
      setStatus('complete');
      actionLogger?.log('processing_complete');
      setTimeout(onComplete, 800);
    };

    run().catch((err) => {
      setError(err.message ?? 'Failed to start processing');
      setStatus('error');
    });

    return () => stopPolling();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  function waitForDashboardPipeline(): Promise<void> {
    return new Promise((resolve, reject) => {
      startPolling(resolve, reject);
    });
  }

  function startPolling(resolve?: () => void, reject?: (e: Error) => void) {
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/sessions/${sessionId}`);
        const data = await r.json();
        const s: ProcessingStatus = data.session?.processing_status ?? 'processing';
        setStatus(s);
        if (data.progress) setProgress(data.progress);
        if (s === 'complete') {
          stopPolling();
          resolve?.();
        } else if (s === 'error') {
          stopPolling();
          const e = new Error('The processing pipeline encountered an error.');
          setError(e.message);
          reject?.(e);
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 2000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  const handleRetry = () => {
    setStatus('processing');
    setError(null);
    triggered.current = false;
    stopPolling();
    triggered.current = true;
    const run = async () => {
      if (forDashboard) {
        await fetch(`/api/sessions/${sessionId}/process`, { method: 'POST' });
        await waitForDashboardPipeline();
      }
      if (precomputeGrades) {
        await runPrecompute();
      }
      setStatus('complete');
      actionLogger?.log('processing_complete');
      setTimeout(onComplete, 800);
    };
    run().catch((err) => {
      setError(err.message);
      setStatus('error');
    });
  };

  const currentIdx = ORDERED.indexOf(status);
  const isError = status === 'error';
  const isDone = status === 'complete';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 p-8" style={{ background: 'var(--background)' }}>
      {/* Icon */}
      <div className="relative">
        {isError ? (
          <AlertCircle className="h-16 w-16 text-red-500" />
        ) : isDone ? (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          </motion.div>
        ) : (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 className="h-16 w-16 text-indigo-500" />
          </motion.div>
        )}
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
          {isError ? 'Something went wrong' : isDone ? 'Ready to grade' : forDashboard ? 'Preparing your cohort' : 'Pre-grading essays…'}
        </h2>
        {isError && (
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{error}</p>
        )}
      </div>

      {/* Step progress */}
      {!isError && (
        <div className="flex w-80 flex-col gap-4">
          {ORDERED.filter(s => s !== 'complete').map((s, idx) => {
            const done = currentIdx > idx;
            const active = currentIdx === idx;

            // Compute sub-progress for the active step
            let sub: { current: number; total: number } | null = null;
            if (progress && progress.total > 0) {
              if (s === 'summarising') sub = { current: progress.summarised, total: progress.total };
              else if (s === 'topics')    sub = { current: progress.topics,     total: progress.total };
              else if (s === 'similarities') sub = { current: progress.similarities, total: progress.total };
              else if (s === 'precomputing') sub = { current: progress.precomputed ?? 0, total: progress.total };
            }
            const pct = sub ? Math.round((sub.current / sub.total) * 100) : 0;

            return (
              <div key={s}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300 ${
                    done ? 'bg-indigo-500 text-white' : active ? 'bg-indigo-500/20 text-indigo-500 ring-2 ring-indigo-500' : 'bg-[var(--card-bg)]'
                  }`} style={!done && !active ? { color: 'var(--muted)' } : {}}>
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                  </div>
                  <div className="flex flex-1 items-center justify-between">
                    <span className={`text-sm transition-colors duration-300 ${active ? 'font-semibold' : ''}`}
                      style={{ color: done || active ? 'var(--foreground)' : 'var(--muted)' }}>
                      {STATUS_LABELS[s]}
                    </span>
                    {active && sub && (
                      <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                        {sub.current} / {sub.total}
                      </span>
                    )}
                    {done && sub && (
                      <span className="text-xs tabular-nums text-emerald-500">{sub.total} / {sub.total}</span>
                    )}
                  </div>
                </div>
                {/* Progress bar — shown when active */}
                {active && sub && sub.total > 0 && (
                  <div className="ml-9 mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--card-border)' }}>
                    <motion.div
                      className="h-full rounded-full bg-indigo-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Retry */}
      {isError && (
        <button
          onClick={handleRetry}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      )}

      {/* Hint */}
      {!isError && !isDone && (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          This may take a few minutes depending on the number of essays and your hardware.
        </p>
      )}
    </div>
  );
}

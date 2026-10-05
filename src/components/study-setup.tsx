'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Loader2, RotateCcw, Check } from 'lucide-react';
import type { StudySession, EssayMeta } from '@/types';

interface SetupResult {
  session: StudySession;
  rubricContent: string;
  essays: EssayMeta[];
}

interface StudySetupProps {
  onComplete: (result: SetupResult) => void;
}

export default function StudySetup({ onComplete }: StudySetupProps) {
  const [participantId, setParticipantId] = useState('');
  const [condition, setCondition] = useState<'baseline' | 'dashboard'>('baseline');
  const [essaySets, setEssaySets] = useState<string[] | null>(null);
  const [precomputedTopicSets, setPrecomputedTopicSets] = useState<string[]>([]);
  const [essaySet, setEssaySet] = useState('');
  const [usePrecomputedTopics, setUsePrecomputedTopics] = useState(false);

  const [precomputedK, setPrecomputedK] = useState(5);
  const [precomputeGrades, setPrecomputeGrades] = useState(true);
  const [useCachedAssessments, setUseCachedAssessments] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topicsResetState, setTopicsResetState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [cachedTopicKs, setCachedTopicKs] = useState<number[] | null>(null);

  // Essay sets = the data/subset_<NAME>.csv files on the server
  useEffect(() => {
    fetch('/api/essay-sets')
      .then((res) => res.json())
      .then((data: { sets?: string[]; precomputedTopicSets?: string[] }) => {
        const sets = data.sets ?? [];
        setEssaySets(sets);
        setPrecomputedTopicSets(data.precomputedTopicSets ?? []);
        setEssaySet((current) => (sets.includes(current) ? current : sets[0] ?? ''));
      })
      .catch(() => setEssaySets([]));
  }, []);

  // The research CSV only covers some sets; elsewhere topics are always computed live
  const usingCsvTopics = usePrecomputedTopics && precomputedTopicSets.includes(essaySet);

  const refreshTopicCache = useCallback(async () => {
    if (!essaySet) return;
    try {
      const res = await fetch(`/api/cache/topics?set=${essaySet}`);
      const data = await res.json();
      setCachedTopicKs(Array.isArray(data.cachedK) ? data.cachedK : null);
    } catch {
      setCachedTopicKs(null);
    }
  }, [essaySet]);

  useEffect(() => { refreshTopicCache(); }, [refreshTopicCache]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!participantId.trim() || !essaySet) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: participantId.trim(), condition, essaySet, usePrecomputedTopics: usingCsvTopics, precomputedK, precomputeGrades, useCachedAssessments }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create session');
      }

      const { sessionId, rubricContent, essays, precomputeGrades: pg, resumed } = await res.json();

      if (resumed && typeof window !== 'undefined') {
        
        // Use sessionStorage so it only survives the next render, not future tabs.
        try {
          sessionStorage.setItem('essay_grader_resumed_at', String(Date.now()));
        } catch { /* ignore quota */ }
      }

      onComplete({
        session: { sessionId, participantId: participantId.trim(), condition, essaySet, precomputeGrades: pg ?? precomputeGrades },
        rubricContent,
        essays,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--background)' }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
            Essay Grading Study
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            Enter your details to begin the session
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-8 shadow-sm"
        >
          {/* Participant ID */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              Participant ID
            </label>
            <input
              type="text"
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              placeholder="e.g. P01"
              required
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              style={{ color: 'var(--foreground)' }}
            />
          </div>

          {/* Condition */}
          <div>
            <label className="mb-2 block text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              Condition
            </label>
            <div className="space-y-2">
              {[
                { value: 'baseline', label: 'Baseline', description: 'Grade essays one by one' },
                { value: 'dashboard', label: 'Dashboard', description: 'Grade with cohort overview' },
              ].map(({ value, label, description }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                    condition === value
                      ? 'border-indigo-500 bg-indigo-500/5'
                      : 'border-[var(--card-border)] hover:border-indigo-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="condition"
                    value={value}
                    checked={condition === value}
                    onChange={() => setCondition(value as 'baseline' | 'dashboard')}
                    className="mt-0.5 accent-indigo-500"
                  />
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      {label}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      {description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Essay Set */}
          <div>
            <label className="mb-2 block text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              Essay Set
            </label>
            {essaySets?.length === 0 && (
              <p className="rounded-lg border border-[var(--card-border)] px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                No essay sets found. Add a CSV named <code>data/subset_NAME.csv</code> (see <code>data/subset_X.csv</code> for the format).
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {(essaySets ?? []).map((set) => (
                <label
                  key={set}
                  className={`flex min-w-[5rem] flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 transition-colors ${
                    essaySet === set
                      ? 'border-indigo-500 bg-indigo-500/5 font-semibold text-indigo-600'
                      : 'border-[var(--card-border)] hover:border-indigo-300'
                  }`}
                  style={{ color: essaySet === set ? undefined : 'var(--foreground)' }}
                >
                  <input
                    type="radio"
                    name="essaySet"
                    value={set}
                    checked={essaySet === set}
                    onChange={() => setEssaySet(set)}
                    className="sr-only"
                  />
                  Set {set}
                </label>
              ))}
            </div>
          </div>

          {/* Pre-computed topics toggle — only for sets the research CSV covers */}
          {precomputedTopicSets.includes(essaySet) && (
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--card-border)] px-4 py-3">
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>Use pre-computed topics</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Load BGE + gemma2:9b assignments from the research CSV instead of computing them live
              </p>
            </div>
            <div
              onClick={() => setUsePrecomputedTopics((v) => !v)}
              className={`relative ml-4 h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                usePrecomputedTopics ? 'bg-indigo-500' : 'bg-[var(--card-border)]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  usePrecomputedTopics ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
          </label>
          )}

          {/* K selector — used by both the CSV and the live BGE + Gemma topic model */}
          <div className="rounded-lg border border-[var(--card-border)] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>Number of topics (k)</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>How many topic clusters to use (4–10)</p>
              </div>
              <div className="flex gap-1.5 ml-4">
                {[4, 5, 6, 7, 8, 9, 10].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPrecomputedK(k)}
                    className={`h-7 w-7 rounded text-xs font-semibold transition-colors ${
                      precomputedK === k
                        ? 'bg-indigo-500 text-white'
                        : 'bg-[var(--card-border)] text-[var(--foreground)] hover:bg-indigo-500/20'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            {!usingCsvTopics && cachedTopicKs && (
              <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                {cachedTopicKs.includes(precomputedK) ? (
                  <span className="font-semibold text-emerald-600">Cached for Set {essaySet}, k={precomputedK}: reused instantly.</span>
                ) : (
                  <>Not cached yet for Set {essaySet}, k={precomputedK}: the first run computes BGE + Gemma topics (a few minutes), later runs reuse them.</>
                )}
                {cachedTopicKs.length > 0 && <> Cached k: {cachedTopicKs.join(', ')}.</>}
              </p>
            )}
          </div>

          {/* Pre-compute grades toggle */}
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--card-border)] px-4 py-3">
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>Pre-compute AI assessments</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Grade all essays with AI before the session starts (recommended)
              </p>
            </div>
            <div
              onClick={() => setPrecomputeGrades((v) => !v)}
              className={`relative ml-4 h-5 w-9 shrink-0 rounded-full transition-colors ${
                precomputeGrades ? 'bg-indigo-500' : 'bg-[var(--card-border)]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  precomputeGrades ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
          </label>

          {/* Use cached assessments toggle — only visible when precompute is on */}
          {precomputeGrades && (
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--card-border)] px-4 py-3">
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>Reuse cached assessments</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  When on: reuse pre-computed grades from a prior session with the same essay set and rubric (faster). When off: generate fresh assessments for this participant.
                </p>
              </div>
              <div
                onClick={() => setUseCachedAssessments((v) => !v)}
                className={`relative ml-4 h-5 w-9 shrink-0 rounded-full transition-colors ${
                  useCachedAssessments ? 'bg-indigo-500' : 'bg-[var(--card-border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    useCachedAssessments ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </label>
          )}

          {/* Reset topic cache */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--card-border)] px-4 py-3">
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>Reset topic cache</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Clears cached BGE + Gemma topics for Set {essaySet} (all k); the next run recomputes them</p>
            </div>
            <button
              type="button"
              disabled={topicsResetState === 'loading'}
              onClick={async () => {
                setTopicsResetState('loading');
                await fetch(`/api/cache/topics?set=${essaySet}`, { method: 'DELETE' });
                await refreshTopicCache();
                setTopicsResetState('done');
                setTimeout(() => setTopicsResetState('idle'), 2000);
              }}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
              style={topicsResetState === 'done'
                ? { background: 'rgb(16 185 129 / 0.1)', color: 'rgb(16 185 129)' }
                : { background: 'var(--card-border)', color: 'var(--foreground)' }}
            >
              {topicsResetState === 'done' ? (
                <><Check className="h-3 w-3" /> Cleared</>
              ) : topicsResetState === 'loading' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <><RotateCcw className="h-3 w-3" /> Reset</>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting || !participantId.trim() || !essaySet}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading essays…
              </>
            ) : (
              'Start Session'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import StudySetup from '@/components/study-setup';
import Navbar from '@/components/navbar';
import ProcessingScreen from '@/components/processing-screen';
import CohortDashboard from '@/components/cohort/cohort-dashboard';
import BaselineEssayList from '@/components/baseline-essay-list';
import ErrorBoundary from '@/components/error-boundary';
import type { TopicData, StatsData } from '@/components/cohort/cohort-dashboard';
import type { ViewType, StudySession, EssayMeta } from '@/types';

const GradingWorkspace = dynamic(() => import('@/components/grading/grading-workspace'), { ssr: false });
const AnalyticsDashboard = dynamic(() => import('@/components/analytics/analytics-dashboard'), { ssr: false });

const viewTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.25, ease: 'easeInOut' as const },
};

export default function Home() {
  const { session, setSession, clearSession, recorder, actionLogger, isLoading } = useSession();
  const [currentView, setCurrentView] = useState<ViewType>('grading');
  const [rubricContent, setRubricContent] = useState('');
  const [essays, setEssays] = useState<EssayMeta[]>([]);
  const [topics, setTopics] = useState<TopicData[]>([]);
  const [sessionStats, setSessionStats] = useState<StatsData>({ totalEssays: 0, gradedEssays: 0, avgGrade: null, gradeDistribution: {} });
  const [currentEssayIndex, setCurrentEssayIndex] = useState(0);
  const [previousEssayIndex, setPreviousEssayIndex] = useState<number | null>(null);
  const [isFetchingSession, setIsFetchingSession] = useState(false);
  const [isAiGrading, setIsAiGrading] = useState(false);
  // null = not yet known; 'pending'/'processing'/... = DC pipeline state; 'complete' = ready
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [showResumedToast, setShowResumedToast] = useState(false);

  // Detect "resumed" flag set by StudySetup on session creation. Display once,
  // then clear the flag so a hard refresh from the workspace doesn't re-show it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!session) return;
    const ts = sessionStorage.getItem('essay_grader_resumed_at');
    if (ts) {
      sessionStorage.removeItem('essay_grader_resumed_at');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowResumedToast(true);
      const t = setTimeout(() => setShowResumedToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, [session?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // On localStorage restore, re-fetch session data (essays + rubric + topics + stats) from API
  useEffect(() => {
    if (!session || essays.length > 0) return;
    setIsFetchingSession(true);
    fetch(`/api/sessions/${session.sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.session) setRubricContent(data.session.rubric_content ?? '');
        if (data.essays) setEssays(data.essays);
        if (data.topics) setTopics(data.topics);
        if (data.stats)  setSessionStats(data.stats);
        const needsProcessing = session.condition === 'dashboard' || (session.precomputeGrades ?? false);
        if (needsProcessing) {
          const ps: string = data.session?.processing_status ?? 'pending';
          // Also check grades_precomputed for baseline+precompute sessions
          const gradesReady = data.session?.grades_precomputed === 1 || !session.precomputeGrades;
          const effectiveStatus = (ps === 'complete' && gradesReady) ? 'complete' : ps;
          setProcessingStatus(effectiveStatus);
          if (effectiveStatus === 'complete') {
            setCurrentView(session.condition === 'dashboard' ? 'cohort' : 'list');
          }
        }
      })
      .catch(console.error)
      .finally(() => setIsFetchingSession(false));
  }, [session?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetupComplete = useCallback(
    ({ session: s, rubricContent: rc, essays: es }: {
      session: StudySession;
      rubricContent: string;
      essays: EssayMeta[];
    }) => {
      setSession(s);
      setRubricContent(rc);
      setEssays(es);
      setCurrentEssayIndex(0);
      // DC always processes (summaries/topics/embeddings); BC processes only when precomputing grades
      const needsProcessing = s.condition === 'dashboard' || (s.precomputeGrades ?? false);
      setProcessingStatus(needsProcessing ? 'pending' : 'complete');
      setCurrentView(s.condition === 'baseline' ? 'list' : 'grading');
    },
    [setSession],
  );

  // Called when the DC processing pipeline finishes — fetch fresh data then show cohort
  const handleProcessingComplete = useCallback(() => {
    if (!session) return;
    fetch(`/api/sessions/${session.sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.essays) setEssays(data.essays);
        if (data.topics) setTopics(data.topics);
        if (data.stats)  setSessionStats(data.stats);
      })
      .catch(console.error)
      .finally(() => {
        setProcessingStatus('complete');
        setCurrentView(session?.condition === 'dashboard' ? 'cohort' : 'list');
      });
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // From cohort view: opening an essay fresh; no "previous essay" to return to.
  const handleSelectEssay = useCallback((essayId: string) => {
    const idx = essays.findIndex((e) => e.id === essayId);
    if (idx !== -1) {
      setPreviousEssayIndex(null);
      setCurrentEssayIndex(idx);
      actionLogger?.log('essay_opened', { essayId });
    }
    setCurrentView('grading');
  }, [essays, actionLogger]);

  // From within grading: opening a comparison/similar essay; remember current so we can return.
  const handleOpenComparisonEssay = useCallback((essayId: string) => {
    const idx = essays.findIndex((e) => e.id === essayId);
    if (idx !== -1) {
      setPreviousEssayIndex(currentEssayIndex);
      setCurrentEssayIndex(idx);
      actionLogger?.log('essay_opened', { essayId });
    }
    setCurrentView('grading');
  }, [essays, actionLogger, currentEssayIndex]);

  const handleBackToPreviousEssay = useCallback(() => {
    if (previousEssayIndex === null) return;
    setCurrentEssayIndex(previousEssayIndex);
    setPreviousEssayIndex(null);
  }, [previousEssayIndex]);

  const handleExportAll = useCallback(async () => {
    recorder?.downloadCSV();
    if (!session) return;
    try {
      const res = await fetch(`/api/export/all?sessionId=${session.sessionId}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${session.participantId}_${new Date().toISOString().split('T')[0]}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [recorder, session]);

  const handleEndSession = useCallback(async () => {
    actionLogger?.log('session_end');
    if (session) {
      fetch(`/api/sessions/${session.sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complete: true }),
      }).catch(console.error);
    }
    await handleExportAll();
    clearSession();
    setRubricContent('');
    setEssays([]);
    setTopics([]);
    setSessionStats({ totalEssays: 0, gradedEssays: 0, avgGrade: null, gradeDistribution: {} });
    setCurrentEssayIndex(0);
    setPreviousEssayIndex(null);
    setProcessingStatus(null);
    setCurrentView('grading');
  }, [actionLogger, session, handleExportAll, clearSession]);

  const handleEssayGraded = useCallback((essayId: string, grade: number | null) => {
    setEssays((prev) => prev.map((e) =>
      e.id === essayId ? { ...e, gradingStatus: 'graded', overallGrade: grade } : e
    ));
    if (session) {
      fetch(`/api/sessions/${session.sessionId}`)
        .then((r) => r.json())
        .then((data) => { if (data.stats) setSessionStats(data.stats); })
        .catch(console.error);
    }
  }, [session]);

  const handleLlmActiveChange = useCallback((active: boolean) => {
    setIsAiGrading(active);
  }, []);

  const handleNavigate = useCallback((view: ViewType) => {
    if (isAiGrading && view !== currentView) {
      if (!window.confirm('The AI is currently grading. Leaving now may cause errors or lost progress. Continue?')) {
        return;
      }
    }
    setCurrentView(view);
    if (view === 'cohort' && session) {
      fetch(`/api/sessions/${session.sessionId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.essays) setEssays(data.essays);
          if (data.stats) setSessionStats(data.stats);
        })
        .catch(console.error);
    }
  }, [isAiGrading, currentView, session]);

  const handleGradeNextEssay = useCallback(() => {
    const nextIndex = currentEssayIndex + 1;
    if (nextIndex >= essays.length) return;
    setCurrentEssayIndex(nextIndex);
    actionLogger?.log('essay_opened', { essayId: essays[nextIndex]?.id });
  }, [currentEssayIndex, essays, actionLogger]);

  const handleBackToCohort = useCallback(() => {
    actionLogger?.log('essay_closed', { essayId: essays[currentEssayIndex]?.id });
    setPreviousEssayIndex(null);
    setCurrentView('cohort');
    if (session) {
      fetch(`/api/sessions/${session.sessionId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.essays) setEssays(data.essays);
          if (data.stats) setSessionStats(data.stats);
        })
        .catch(console.error);
    }
  }, [currentEssayIndex, essays, actionLogger, session]);

  const handleBackToList = useCallback(() => {
    actionLogger?.log('essay_closed', { essayId: essays[currentEssayIndex]?.id });
    setPreviousEssayIndex(null);
    setCurrentView('list');
    if (session) {
      fetch(`/api/sessions/${session.sessionId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.essays) setEssays(data.essays);
          if (data.stats) setSessionStats(data.stats);
        })
        .catch(console.error);
    }
  }, [currentEssayIndex, essays, actionLogger, session]);

  // Loading: hydrating from localStorage or re-fetching session
  if (isLoading || isFetchingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--background)' }}>
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // No session: show setup gate
  if (!session) {
    return <StudySetup onComplete={handleSetupComplete} />;
  }

  // Show processing screen until pipeline (and optional precomputation) completes
  if (processingStatus !== 'complete' && processingStatus !== null) {
    return (
      <ProcessingScreen
        sessionId={session.sessionId}
        forDashboard={session.condition === 'dashboard'}
        precomputeGrades={session.precomputeGrades ?? false}
        onComplete={handleProcessingComplete}
        actionLogger={actionLogger}
      />
    );
  }

  const currentEssay = essays[currentEssayIndex] ?? null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
        session={session}
        onExportCSV={handleExportAll}
        onEndSession={handleEndSession}
        isAiGrading={isAiGrading}
      />

      <AnimatePresence>
        {showResumedToast && (
          <motion.div
            key="resumed-toast"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-md dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          >
            Resumed your previous session
          </motion.div>
        )}
      </AnimatePresence>

      <main className="pt-4">
        <AnimatePresence mode="wait">
          {/* Baseline Essay List (BC only) */}
          {currentView === 'list' && session.condition === 'baseline' && (
            <motion.div key="list" {...viewTransition}>
              <BaselineEssayList
                essays={essays}
                onSelectEssay={handleSelectEssay}
              />
            </motion.div>
          )}

          {/* Cohort Dashboard (DC only) */}
          {currentView === 'cohort' && session.condition === 'dashboard' && (
            <motion.div key="cohort" {...viewTransition}>
              <ErrorBoundary>
                <CohortDashboard
                  essays={essays}
                  topics={topics}
                  stats={sessionStats}
                  sessionId={session.sessionId}
                  onSelectEssay={handleSelectEssay}
                  actionLogger={actionLogger}
                />
              </ErrorBoundary>
            </motion.div>
          )}

          {/* Grading */}
          {currentView === 'grading' && (
            <motion.div key="grading" {...viewTransition}>
              <ErrorBoundary>
                {recorder && (
                  <GradingWorkspace
                    recorder={recorder}
                    actionLogger={actionLogger}
                    studySession={session}
                    preloadedRubric={rubricContent}
                    preloadedEssay={currentEssay}
                    onRequestNextEssay={handleGradeNextEssay}
                    onBackToCohort={session.condition === 'dashboard' && previousEssayIndex === null ? handleBackToCohort : undefined}
                    onBackToList={session.condition === 'baseline' ? handleBackToList : undefined}
                    onBackToPreviousEssay={session.condition === 'dashboard' && previousEssayIndex !== null ? handleBackToPreviousEssay : undefined}
                    previousEssayNumber={previousEssayIndex !== null ? previousEssayIndex + 1 : undefined}
                    onOpenEssay={session.condition === 'dashboard' ? handleOpenComparisonEssay : undefined}
                    essayIndex={currentEssayIndex}
                    totalEssays={essays.length}
                    onEssayGraded={handleEssayGraded}
                    onLlmActiveChange={handleLlmActiveChange}
                  />
                )}
              </ErrorBoundary>
            </motion.div>
          )}

          {/* Analytics */}
          {currentView === 'analytics' && (
            <motion.div key="analytics" {...viewTransition}>
              <ErrorBoundary>
                <AnalyticsDashboard
                  records={recorder?.getRecords() ?? []}
                  teacherName={session.participantId}
                  onDownloadCSV={handleExportAll}
                  sessionId={session.sessionId}
                />
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

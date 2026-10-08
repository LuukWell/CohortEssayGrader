'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Check,
  BookOpen,
} from 'lucide-react';
import type {
  Criterion,
  Assessment,
  Evidence,
  ContextItem,
  AssessmentType,
  AssessmentLength,
  HallucinationThreshold,
  OverallAssessmentResult,
  WorkflowStep,
  StudySession,
  EssayMeta,
} from '@/types';
import {
  gradeSingleCriterion,
} from '@/lib/llm-service';
import { RUBRIC_CRITERIA } from '@/lib/llm-config';
import type { CsvRecorder } from '@/lib/csv-recorder';
import type { ActionLogger } from '@/lib/action-logger';

import WelcomeSection from '@/components/grading/welcome-section';
import AssessmentSettings from '@/components/grading/assessment-settings';
import InteractiveGrading from '@/components/grading/interactive-grading';
import CohortContextPanel from '@/components/cohort/cohort-context-panel';

interface SavedGrade {
  criterion_name: string;
  criterion_id: number;
  teacher_score: number | null;
  ai_score: number | null;
  original_ai_score: number | null;
  teacher_justification: string | null;
  ai_justification: string | null;
  evidence_json: string | null;
}

type PendingAction = 'auto-start' | { grades: SavedGrade[] } | null;

export interface GradingWorkspaceProps {
  recorder: CsvRecorder;
  actionLogger?: ActionLogger | null;
  studySession?: StudySession | null;
  preloadedRubric?: string;
  preloadedEssay?: EssayMeta | null;
  onRequestNextEssay?: () => void;
  onBackToCohort?: () => void;
  onBackToList?: () => void;
  onBackToPreviousEssay?: () => void;
  previousEssayNumber?: number;
  onOpenEssay?: (essayId: string) => void;
  essayIndex?: number;
  totalEssays?: number;
  onEssayGraded?: (essayId: string, grade: number | null) => void;
  onLlmActiveChange?: (active: boolean) => void;
}

// Step indicator
const STEPS: { key: WorkflowStep; label: string }[] = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'rubric', label: 'Rubric' },
  { key: 'settings', label: 'Settings' },
  { key: 'grading', label: 'Grading' },
  { key: 'complete', label: 'Complete' },
];

function StepIndicator({ currentStep }: { currentStep: WorkflowStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3">
      {STEPS.map((step, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div
                className="h-0.5 w-6 rounded-full transition-colors duration-300"
                style={{ background: isDone ? '#6366F1' : 'var(--card-border)' }}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                  isActive
                    ? 'bg-[#6366F1] text-white shadow-md shadow-indigo-500/30'
                    : isDone
                    ? 'bg-[#6366F1] text-white'
                    : 'border border-[var(--card-border)] text-[var(--muted)]'
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={`hidden text-xs font-medium sm:inline ${
                  isActive ? 'text-[#6366F1]' : isDone ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'
                }`}
              >
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Step wrapper with navigation
function StepContainer({
  children,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextIcon,
}: {
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextIcon?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      {children}
      <div className="flex items-center justify-between pt-2">
        {onBack ? (
          <button
            onClick={onBack}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--card-border)] px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-[var(--card-bg)]"
            style={{ color: 'var(--muted)' }}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <div />
        )}
        {onNext && (
          <button
            onClick={onNext}
            disabled={nextDisabled}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#6366F1] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#5558E6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {nextLabel || 'Next'}
            {nextIcon || <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

// Slide animation
const slideVariants = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, x: -40, transition: { duration: 0.15 } },
};

export default function GradingWorkspace({
  recorder,
  actionLogger,
  studySession,
  preloadedRubric,
  preloadedEssay,
  onRequestNextEssay,
  onBackToCohort,
  onBackToList,
  onBackToPreviousEssay,
  previousEssayNumber,
  onOpenEssay,
  essayIndex,
  totalEssays,
  onEssayGraded,
  onLlmActiveChange,
}: GradingWorkspaceProps) {
  // workflow step
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('welcome');

  // core data state
  const [essayFileName, setEssayFileName] = useState<string | null>(null);
  const [pdfContent, setPdfContent] = useState<string>('');
  const [rubricContent, setRubricContent] = useState<string>('');
  const [rubricCriteria, setRubricCriteria] = useState<Criterion[]>(RUBRIC_CRITERIA);
  const [criteriaAssessments, setCriteriaAssessments] = useState<Record<string, Assessment>>({});

  // grading navigation state
  const [currentCriterionIndex, setCurrentCriterionIndex] = useState<number>(0);
  const [teacherScores, setTeacherScores] = useState<Record<string, number | null>>({});
  const [showAIScores, setShowAIScores] = useState<Record<string, boolean>>({});
  const [gradingComplete, setGradingComplete] = useState<boolean>(false);
  const [overallAssessment, setOverallAssessment] = useState<OverallAssessmentResult | null>(null);

  // settings state
  const [contextList, setContextList] = useState<ContextItem[]>([]);
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('flow');
  const [assessmentLength, setAssessmentLength] = useState<AssessmentLength>('medium');
  const [hallucinationThreshold, setHallucinationThreshold] = useState<HallucinationThreshold>('medium');

  // UI state
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [isLlmActive, setIsLlmActive] = useState(false);

  // timing
  const [criterionStartTime, setCriterionStartTime] = useState<number | null>(null);

  // pdf evidence highlight
  const [activePdfEvidence, setActivePdfEvidence] = useState<Evidence | null>(null);

  // teacher justifications
  const [teacherJustifications, setTeacherJustifications] = useState<Record<string, string>>({});

  // hallucination tracking
  const [hallucinationCounts, setHallucinationCounts] = useState<
    Record<string, { detected: number; confirmed: number; reported: number }>
  >({});

  // pending action from grade fetch (restore or auto-start)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  // ref to prevent duplicate grading
  const gradingInProgress = useRef<Set<number>>(new Set());

  /* Sync LLM active state to parent */
  useEffect(() => {
    onLlmActiveChange?.(isLlmActive);
  }, [isLlmActive, onLlmActiveChange]);

  // ref to detect essay changes
  const prevEssayIdRef = useRef<string | null>(null);

  // Populate rubric from preloaded study data
  useEffect(() => {
    if (preloadedRubric) setRubricContent(preloadedRubric);
  }, [preloadedRubric]);

  // When the essay changes, reset state and restore saved grades
  useEffect(() => {
    if (!preloadedEssay) return;

    const isFirstMount = prevEssayIdRef.current === null;
    const isEssayChange = !isFirstMount && prevEssayIdRef.current !== preloadedEssay.id;
    prevEssayIdRef.current = preloadedEssay.id;

    setPdfContent(preloadedEssay.content);
    setEssayFileName(preloadedEssay.filename);

    if (isEssayChange) {
      // Reset grading state; keep rubricCriteria and settings
      setCriteriaAssessments({});
      setCurrentCriterionIndex(0);
      setTeacherScores({});
      setShowAIScores({});
      setGradingComplete(false);
      setOverallAssessment(null);
      setTeacherJustifications({});
      setHallucinationCounts({});
      setActivePdfEvidence(null);
      setPendingAction(null);
      gradingInProgress.current.clear();
    }

    // In standalone mode (no session) keep the welcome-screen flow
    if (!studySession) return;

    let cancelled = false;

    fetch(`/api/sessions/${studySession.sessionId}/grades?essayId=${preloadedEssay.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const grades: SavedGrade[] = data.grades ?? [];
        if (grades.length > 0) {
          setPendingAction({ grades });
        } else {
          setPendingAction('auto-start');
        }
        setCurrentStep('grading');
      })
      .catch(() => {
        if (!cancelled) {
          setPendingAction('auto-start');
          setCurrentStep('grading');
        }
      });

    return () => { cancelled = true; };
  }, [preloadedEssay?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const gradeCurrentCriterion = useCallback(
    async (criteria: Criterion[], index: number) => {
      if (gradingInProgress.current.has(index)) return;
      gradingInProgress.current.add(index);
      setIsLlmActive(true);

      const criterion = criteria[index];
      if (!criterion) {
        gradingInProgress.current.delete(index);
        return;
      }

      try {
        const result = await gradeSingleCriterion(
          pdfContent,
          criterion,
          { assessmentType, assessmentLength },
          contextList,
          rubricContent,
        );

        const newAssessment: Assessment = {
          ...criterion,
          justification: result.justification,
          evidence: (result.evidence ?? []).map((e) => ({
            quote: e.quote,
            paragraph: e.paragraph,
            relatedAssessmentIndexes: e.relatedAssessmentIndexes,
          })),
          score: result.score ?? criterion.scoreRange.min,
          aiScore: result.score,
          originalAiScore: result.score,
          revisionRationale: null,
          revisedAssessmentText: null,
          error: result.error,
        };

        setCriteriaAssessments((prev) => ({
          ...prev,
          [criterion.name]: newAssessment,
        }));
      } catch (err) {
        console.error(`Error grading criterion "${criterion.name}":`, err);
        throw err;
      } finally {
        gradingInProgress.current.delete(index);
        if (gradingInProgress.current.size === 0) setIsLlmActive(false);
      }
    },
    [pdfContent, rubricContent, contextList, assessmentType, assessmentLength],
  );

  // Process pending action once pdfContent is ready
  useEffect(() => {
    if (!pendingAction || !pdfContent) return;

    if (pendingAction === 'auto-start') {
      setPendingAction(null);
      setCurrentCriterionIndex(0);
      setCriterionStartTime(Date.now());
      setOllamaError(null);
      actionLogger?.log('ai_grading_started', { essayId: preloadedEssay?.id });
      gradeCurrentCriterion(RUBRIC_CRITERIA, 0)
        .then(() => actionLogger?.log('ai_grading_complete', { essayId: preloadedEssay?.id }))
        .catch(console.error);
    } else {
      // Restore grades from saved data
      const grades = pendingAction.grades;
      setPendingAction(null);

      const restoredAssessments: Record<string, Assessment> = {};
      const restoredTeacherScores: Record<string, number | null> = {};
      const restoredShowAI: Record<string, boolean> = {};
      const restoredTeacherJustifications: Record<string, string> = {};

      for (const g of grades) {
        const criterion = RUBRIC_CRITERIA.find((c) => c.name === g.criterion_name);
        if (!criterion) continue;

        const justText = g.ai_justification ?? '';
        const justification: string | string[] =
          justText.includes('\n') ? justText.split('\n').filter(Boolean) : justText;

        let evidence: Evidence[] = [];
        if (g.evidence_json) {
          try { evidence = JSON.parse(g.evidence_json); } catch { /* ignore */ }
        }

        restoredAssessments[g.criterion_name] = {
          ...criterion,
          justification,
          evidence,
          score: g.ai_score ?? criterion.scoreRange.min,
          aiScore: g.ai_score,
          originalAiScore: g.original_ai_score,
          revisionRationale: null,
          revisedAssessmentText: null,
        };

        restoredTeacherScores[g.criterion_name] = g.teacher_score ?? null;
        if (g.teacher_score !== null) restoredShowAI[g.criterion_name] = true;
        if (g.teacher_justification) restoredTeacherJustifications[g.criterion_name] = g.teacher_justification;
      }

      setCriteriaAssessments(restoredAssessments);
      setTeacherScores(restoredTeacherScores);
      setShowAIScores(restoredShowAI);
      setTeacherJustifications(restoredTeacherJustifications);
      setCurrentCriterionIndex(0);
      setCriterionStartTime(Date.now());
      actionLogger?.log('grades_restored', { essayId: preloadedEssay?.id, count: grades.length });
    }
  }, [pendingAction, pdfContent, gradeCurrentCriterion, actionLogger, preloadedEssay?.id]);

  // Start grading from the settings step
  const startInteractiveGrading = useCallback(() => {
    if (!pdfContent) return;
    const criteria = rubricCriteria;
    setCurrentCriterionIndex(0);
    setCriterionStartTime(Date.now());
    setCriteriaAssessments({});
    setTeacherScores({});
    setShowAIScores({});
    setGradingComplete(false);
    setOverallAssessment(null);
    setOllamaError(null);
    setCurrentStep('grading');
    actionLogger?.log('ai_grading_started', { essayId: preloadedEssay?.id });
    gradeCurrentCriterion(criteria, 0)
      .then(() => actionLogger?.log('ai_grading_complete', { essayId: preloadedEssay?.id, criteriaCount: criteria.length }))
      .catch(console.error);
  }, [pdfContent, rubricCriteria, gradeCurrentCriterion, actionLogger, preloadedEssay?.id]);

  const handleTeacherScoreInput = useCallback((criterionId: string, score: number) => {
    setTeacherScores((prev) => ({ ...prev, [criterionId]: score }));
    actionLogger?.log('teacher_score_assigned', { criterionId, score }, preloadedEssay?.id);
  }, [actionLogger, preloadedEssay?.id]);

  const revealAIScore = useCallback((criterionId: string) => {
    setShowAIScores((prev) => ({ ...prev, [criterionId]: true }));
  }, []);

  const handleTeacherJustificationInput = useCallback((criterionId: string, text: string) => {
    setTeacherJustifications((prev) => ({ ...prev, [criterionId]: text }));
    actionLogger?.log('teacher_justification_written', { criterionId }, preloadedEssay?.id);
  }, [actionLogger, preloadedEssay?.id]);

  // Save a grade to SQLite (fire-and-forget)
  const persistGrade = useCallback((
    criterion: { id: number; name: string },
    assessment: Assessment,
    teacherScore: number | null,
    teacherJustification: string,
  ) => {
    if (!studySession || !preloadedEssay) return;
    const justText = Array.isArray(assessment.justification)
      ? assessment.justification.join('\n')
      : assessment.justification;
    fetch(`/api/sessions/${studySession.sessionId}/grades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        essayId: preloadedEssay.id,
        criterionName: criterion.name,
        criterionId: criterion.id,
        teacher_score: teacherScore,
        ai_score: assessment.aiScore ?? null,
        original_ai_score: assessment.originalAiScore ?? null,
        teacher_justification: teacherJustification || null,
        ai_justification: justText || null,
        evidence_json: assessment.evidence?.length ? JSON.stringify(assessment.evidence) : null,
      }),
    }).catch(console.error);
  }, [studySession, preloadedEssay]);

  // DC: mark the current essay as the benchmark for this criterion
  const handleSetBenchmark = useCallback(async () => {
    if (!studySession || !preloadedEssay) return;
    const criterion = rubricCriteria[currentCriterionIndex];
    if (!criterion) return;
    const score = teacherScores[criterion.name];
    if (score === null || score === undefined) return;

    await fetch(`/api/sessions/${studySession.sessionId}/benchmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        criterionName: criterion.name,
        essayId: preloadedEssay.id,
        type: String(score),
        score,
      }),
    }).catch(console.error);
    actionLogger?.log('benchmark_set', { criterionName: criterion.name, type: String(score) }, preloadedEssay.id);
  }, [studySession, preloadedEssay, rubricCriteria, currentCriterionIndex, teacherScores, actionLogger]);

  const moveToNextCriterion = useCallback(() => {
    const criterion = rubricCriteria[currentCriterionIndex];
    if (!criterion) return;

    const assessment = criteriaAssessments[criterion.name];
    if (assessment && recorder) {
      const elapsedMs = criterionStartTime ? Date.now() - criterionStartTime : 0;
      const hCounts = hallucinationCounts[criterion.name] ?? { detected: 0, confirmed: 0, reported: 0 };
      const tScore = teacherScores[criterion.name] ?? null;
      const aScore = assessment.aiScore;
      recorder.addGradeRecord({
        essay_id: essayFileName || '',
        criterion_name: criterion.name,
        criterion_id: String(criterion.id),
        score_min: criterion.scoreRange.min,
        score_max: criterion.scoreRange.max,
        teacher_score: tScore,
        ai_score: aScore,
        revised_ai_score: assessment.originalAiScore !== aScore ? aScore : null,
        score_difference: tScore !== null && aScore !== null ? tScore - aScore : null,
        assessment_type: assessmentType,
        assessment_length: assessmentLength,
        hallucination_threshold: hallucinationThreshold,
        evidence_count: assessment.evidence?.length ?? 0,
        time_spent_seconds: Math.round(elapsedMs / 1000),
        hallucinations_detected: hCounts.detected,
        hallucinations_confirmed: hCounts.confirmed,
        hallucinations_reported: hCounts.reported,
        action_type: 'grade',
        assessment_was_edited: assessment.revisedAssessmentText !== null,
        original_ai_score: assessment.originalAiScore,
        edited_justification_text: assessment.revisedAssessmentText ?? null,
      });
    }

    actionLogger?.log('grade_submitted', { criterionName: criterion.name }, preloadedEssay?.id);

    if (assessment) {
      persistGrade(criterion, assessment, teacherScores[criterion.name] ?? null, teacherJustifications[criterion.name] ?? '');
    }

    const nextIndex = currentCriterionIndex + 1;
    if (nextIndex >= rubricCriteria.length) return;

    setCurrentCriterionIndex(nextIndex);
    setCriterionStartTime(Date.now());
    setActivePdfEvidence(null);

    const nextCriterion = rubricCriteria[nextIndex];
    if (nextCriterion && !criteriaAssessments[nextCriterion.name]) {
      gradeCurrentCriterion(rubricCriteria, nextIndex);
    }
  }, [
    rubricCriteria,
    currentCriterionIndex,
    criteriaAssessments,
    recorder,
    criterionStartTime,
    teacherScores,
    essayFileName,
    gradeCurrentCriterion,
    hallucinationCounts,
    assessmentType,
    assessmentLength,
    hallucinationThreshold,
    actionLogger,
    preloadedEssay?.id,
    persistGrade,
    teacherJustifications,
  ]);

  const moveToPreviousCriterion = useCallback(() => {
    if (currentCriterionIndex <= 0) return;
    setCurrentCriterionIndex((prev) => prev - 1);
    setCriterionStartTime(Date.now());
    setActivePdfEvidence(null);
  }, [currentCriterionIndex]);

  const finishGrading = useCallback(async () => {
    const criterion = rubricCriteria[currentCriterionIndex];
    if (criterion) {
      const assessment = criteriaAssessments[criterion.name];
      if (assessment && recorder) {
        const elapsedMs = criterionStartTime ? Date.now() - criterionStartTime : 0;
        const hCounts = hallucinationCounts[criterion.name] ?? { detected: 0, confirmed: 0, reported: 0 };
        const tScore = teacherScores[criterion.name] ?? null;
        const aScore = assessment.aiScore;
        recorder.addGradeRecord({
          essay_id: essayFileName || '',
          criterion_name: criterion.name,
          criterion_id: String(criterion.id),
          score_min: criterion.scoreRange.min,
          score_max: criterion.scoreRange.max,
          teacher_score: tScore,
          ai_score: aScore,
          revised_ai_score: assessment.originalAiScore !== aScore ? aScore : null,
          score_difference: tScore !== null && aScore !== null ? tScore - aScore : null,
          assessment_type: assessmentType,
          assessment_length: assessmentLength,
          hallucination_threshold: hallucinationThreshold,
          evidence_count: assessment.evidence?.length ?? 0,
          time_spent_seconds: Math.round(elapsedMs / 1000),
          hallucinations_detected: hCounts.detected,
          hallucinations_confirmed: hCounts.confirmed,
          hallucinations_reported: hCounts.reported,
          action_type: 'grade',
          assessment_was_edited: assessment.revisedAssessmentText !== null,
          original_ai_score: assessment.originalAiScore,
          edited_justification_text: assessment.revisedAssessmentText ?? null,
        });
      }
    }

    if (criterion) {
      const lastAssessment = criteriaAssessments[criterion.name];
      if (lastAssessment) {
        persistGrade(criterion, lastAssessment, teacherScores[criterion.name] ?? null, teacherJustifications[criterion.name] ?? '');
      }
    }

    const tScores = rubricCriteria
      .map((c) => teacherScores[c.name])
      .filter((s): s is number => s != null);
    const avgGrade = tScores.length > 0
      ? Math.round((tScores.reduce((sum, s) => sum + s, 0) / tScores.length) * 10) / 10
      : null;

    const scoreSummary = rubricCriteria
      .map((c) => {
        const ts = teacherScores[c.name];
        const as = criteriaAssessments[c.name]?.aiScore;
        return `${c.name}: ${ts ?? as ?? '—'}/${c.scoreRange.max}`;
      })
      .join(', ');

    const overall: OverallAssessmentResult = {
      strengths: 'Grading complete. Review individual criterion assessments for detailed feedback.',
      improvements: 'Refer to the criterion-level justifications for specific areas to improve.',
      overallGrade: avgGrade ?? '—',
      advice: `Scores — ${scoreSummary}`,
    };

    if (studySession && preloadedEssay) {
      fetch(`/api/sessions/${studySession.sessionId}/essays/${preloadedEssay.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grading_status: 'graded', overall_grade: avgGrade }),
      }).catch(console.error);
      onEssayGraded?.(preloadedEssay.id, avgGrade ?? null);
    }

    setOverallAssessment(overall);
    setGradingComplete(true);
    setCurrentStep('complete');
    actionLogger?.log('all_grades_submitted', { essayId: preloadedEssay?.id });
  }, [
    rubricCriteria,
    currentCriterionIndex,
    criteriaAssessments,
    recorder,
    criterionStartTime,
    teacherScores,
    teacherJustifications,
    essayFileName,
    hallucinationCounts,
    assessmentType,
    assessmentLength,
    hallucinationThreshold,
    actionLogger,
    preloadedEssay,
    studySession,
    persistGrade,
    onEssayGraded,
  ]);

  const restartGrading = useCallback(() => {
    // Common state reset
    setCriteriaAssessments({});
    setCurrentCriterionIndex(0);
    setTeacherScores({});
    setShowAIScores({});
    setGradingComplete(false);
    setOverallAssessment(null);
    setActivePdfEvidence(null);
    setHallucinationCounts({});
    setTeacherJustifications({});
    setPendingAction(null);
    gradingInProgress.current.clear();

    if (studySession && preloadedEssay && pdfContent) {
      // Study session: re-grade current essay directly, skip the wizard
      setCurrentStep('grading');
      setCriterionStartTime(Date.now());
      setOllamaError(null);
      gradeCurrentCriterion(rubricCriteria, 0);
    } else {
      // Standalone: go back through the setup wizard
      setCurrentStep('welcome');
      setEssayFileName(null);
      setPdfContent('');
      if (!preloadedRubric) setRubricContent('');
      setRubricCriteria(RUBRIC_CRITERIA);
      setContextList([]);
      setAssessmentType('flow');
      setAssessmentLength('medium');
      setHallucinationThreshold('medium');
      setCriterionStartTime(null);
    }
  }, [studySession, preloadedEssay, pdfContent, rubricCriteria, gradeCurrentCriterion, preloadedRubric]);

  const gradeNextEssay = useCallback(() => {
    setCurrentStep('settings');
    setEssayFileName(null);
    setPdfContent('');
    setCriteriaAssessments({});
    setCurrentCriterionIndex(0);
    setTeacherScores({});
    setShowAIScores({});
    setGradingComplete(false);
    setOverallAssessment(null);
    setCriterionStartTime(null);
    setActivePdfEvidence(null);
    setHallucinationCounts({});
    setTeacherJustifications({});
    setPendingAction(null);
    gradingInProgress.current.clear();
    onRequestNextEssay?.();
  }, [onRequestNextEssay]);

  // Leave the summary and go back to the per-criterion view
  const backToGrading = useCallback(() => {
    setGradingComplete(false);
  }, []);

  const updateHallucinationCounts = useCallback(
    (criterionName: string, counts: { detected: number; confirmed: number; reported: number }) => {
      setHallucinationCounts((prev) => {
        const existing = prev[criterionName] ?? { detected: 0, confirmed: 0, reported: 0 };
        return {
          ...prev,
          [criterionName]: {
            detected: counts.detected || existing.detected,
            confirmed: counts.confirmed || existing.confirmed,
            reported: existing.reported + (counts.reported || 0),
          },
        };
      });
    },
    [],
  );

  return (
    <div className="relative flex h-full w-full flex-col" style={{ background: 'var(--background)' }}>
      {/* Step indicator (hidden during active grading/complete) */}
      {currentStep !== 'grading' && currentStep !== 'complete' && (
        <StepIndicator currentStep={currentStep} />
      )}

      <div className="flex flex-1 flex-col overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* Step 1: Welcome */}
          {currentStep === 'welcome' && (
            <motion.div key="welcome" {...slideVariants}>
              <WelcomeSection onContinue={() => setCurrentStep('rubric')} />
            </motion.div>
          )}

          {/* Step 2: Rubric */}
          {currentStep === 'rubric' && (
            <motion.div key="rubric" {...slideVariants}>
              <StepContainer
                onBack={() => setCurrentStep('welcome')}
                onNext={() => {
                  actionLogger?.log('rubric_reviewed');
                  setCurrentStep('settings');
                }}
                nextDisabled={!rubricContent.trim()}
              >
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                      <BookOpen className="h-5 w-5 text-indigo-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                        Grading Rubric
                      </h2>
                      <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                        Read the rubric carefully before grading. This rubric will be used for all essays in this session.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-[var(--card-border)]">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--card-border)] bg-indigo-500/10">
                          <th className="px-4 py-3 font-semibold" style={{ color: 'var(--foreground)' }}>Criterion</th>
                          <th className="px-4 py-3 font-semibold" style={{ color: 'var(--foreground)' }}>Range</th>
                          <th className="px-4 py-3 font-semibold" style={{ color: 'var(--foreground)' }}>Score levels</th>
                        </tr>
                      </thead>
                      <tbody>
                        {RUBRIC_CRITERIA.map((criterion) => (
                          <tr key={criterion.name} className="border-b border-[var(--card-border)] last:border-b-0" style={{ background: 'var(--card-bg)' }}>
                            <td className="px-4 py-3 font-medium align-top" style={{ color: 'var(--foreground)' }}>{criterion.name}</td>
                            <td className="px-4 py-3 align-top" style={{ color: 'var(--muted)' }}>{criterion.scoreRange.min}–{criterion.scoreRange.max}</td>
                            <td className="px-4 py-3">
                              <ul className="space-y-1">
                                {criterion.levels.map((level) => (
                                  <li key={level.score} className="text-xs" style={{ color: 'var(--muted)' }}>
                                    <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{level.score}</span> — {level.description}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </StepContainer>
            </motion.div>
          )}

          {/* Step 3: Settings */}
          {currentStep === 'settings' && (
            <motion.div key="settings" {...slideVariants}>
              <StepContainer
                onBack={() => setCurrentStep('rubric')}
                onNext={() => { setOllamaError(null); startInteractiveGrading(); }}
                nextLabel="Start Grading"
                nextDisabled={!pdfContent || !rubricContent}
                nextIcon={<Play className="h-4 w-4" />}
              >
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                      Grading Settings
                    </h2>
                    <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                      Configure how the AI should assess the essay.
                    </p>
                  </div>

                  <AssessmentSettings
                    assessmentType={assessmentType}
                    assessmentLength={assessmentLength}
                    hallucinationThreshold={hallucinationThreshold}
                    setAssessmentType={setAssessmentType}
                    setAssessmentLength={setAssessmentLength}
                    setHallucinationThreshold={setHallucinationThreshold}
                  />

                  {ollamaError && (
                    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-950/20">
                      <p className="text-sm text-red-600 dark:text-red-400">{ollamaError}</p>
                    </div>
                  )}

                  {preloadedEssay && (
                    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                          Essay to grade
                        </div>
                        {essayIndex != null && totalEssays != null && (
                          <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                            {essayIndex + 1} / {totalEssays}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                        {preloadedEssay.filename}
                      </div>
                      {preloadedEssay.wordCount && (
                        <div className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                          {preloadedEssay.wordCount} words
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </StepContainer>
            </motion.div>
          )}

          {/* Grading and summary */}
          {(currentStep === 'grading' || currentStep === 'complete') && (
            <motion.div key="grading" {...slideVariants} className="flex h-full flex-1 flex-col overflow-hidden">
              {/* Header bar: back button + essay info */}
              {preloadedEssay && (
                <div
                  className="flex shrink-0 items-center gap-3 border-b border-[var(--card-border)] px-4 py-2"
                  style={{ background: 'var(--background)' }}
                >
                  {onBackToPreviousEssay ? (
                    <button
                      onClick={isLlmActive ? undefined : onBackToPreviousEssay}
                      disabled={isLlmActive}
                      title={isLlmActive ? 'Wait for AI to finish grading' : undefined}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--card-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ color: 'var(--muted)', cursor: isLlmActive ? 'not-allowed' : 'pointer' }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Essay {previousEssayNumber}
                    </button>
                  ) : onBackToCohort ? (
                    <button
                      onClick={isLlmActive ? undefined : onBackToCohort}
                      disabled={isLlmActive}
                      title={isLlmActive ? 'Wait for AI to finish grading' : undefined}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--card-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ color: 'var(--muted)', cursor: isLlmActive ? 'not-allowed' : 'pointer' }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Cohort
                    </button>
                  ) : onBackToList ? (
                    <button
                      onClick={isLlmActive ? undefined : onBackToList}
                      disabled={isLlmActive}
                      title={isLlmActive ? 'Wait for AI to finish grading' : undefined}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--card-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ color: 'var(--muted)', cursor: isLlmActive ? 'not-allowed' : 'pointer' }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      List
                    </button>
                  ) : null}
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                      {preloadedEssay.filename}
                    </span>
                    {essayIndex != null && totalEssays != null && (
                      <span className="shrink-0 rounded bg-[var(--card-bg)] px-2 py-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                        {essayIndex + 1} / {totalEssays}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex min-w-0 flex-1 overflow-hidden">
              <div className="min-w-0 flex-1 overflow-hidden">
                <InteractiveGrading
                  pdfContent={pdfContent}
                  essayPrompt={preloadedEssay?.prompt ?? null}
                  rubricContent={rubricContent}
                  rubricCriteria={rubricCriteria}
                  criteriaAssessments={criteriaAssessments}
                  currentCriterionIndex={currentCriterionIndex}
                  teacherScores={teacherScores}
                  showAIScores={showAIScores}
                  contextList={contextList}
                  assessmentType={assessmentType}
                  assessmentLength={assessmentLength}
                  hallucinationThreshold={hallucinationThreshold}
                  gradingComplete={gradingComplete}
                  overallAssessment={overallAssessment}
                  handleTeacherScoreInput={handleTeacherScoreInput}
                  revealAIScore={revealAIScore}
                  moveToNextCriterion={moveToNextCriterion}
                  moveToPreviousCriterion={moveToPreviousCriterion}
                  finishGrading={finishGrading}
                  restartGrading={restartGrading}
                  gradeCurrentCriterion={gradeCurrentCriterion}
                  setCriteriaAssessments={setCriteriaAssessments}
                  criterionStartTime={criterionStartTime}
                  activePdfEvidence={activePdfEvidence}
                  setActivePdfEvidence={setActivePdfEvidence}
                  setAssessmentType={setAssessmentType}
                  teacherJustifications={teacherJustifications}
                  onTeacherJustificationChange={handleTeacherJustificationInput}
                  onRevisitCriteria={backToGrading}
                  onBackToCohort={onBackToCohort}
                  onBackToList={onBackToList}
                  onHallucinationUpdate={updateHallucinationCounts}
                  onSetBenchmark={studySession?.condition === 'dashboard' ? handleSetBenchmark : undefined}
                  actionLogger={actionLogger}
                  essayId={preloadedEssay?.id ?? null}
                  sessionId={studySession?.sessionId ?? null}
                />
              </div>

              {/* DC-only cohort context sidebar */}
              {studySession?.condition === 'dashboard' && currentStep === 'grading' && preloadedEssay && (
                <CohortContextPanel
                  sessionId={studySession.sessionId}
                  essayId={preloadedEssay.id}
                  criterionName={rubricCriteria[currentCriterionIndex]?.name ?? null}
                  currentAssessment={(() => {
                    const name = rubricCriteria[currentCriterionIndex]?.name;
                    const a = name ? criteriaAssessments[name] : undefined;
                    return a ? { justification: a.justification, aiScore: a.aiScore } : null;
                  })()}
                  actionLogger={actionLogger}
                  onOpenEssay={onOpenEssay}
                  disableEssayOpen={isLlmActive}
                />
              )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

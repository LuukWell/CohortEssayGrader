'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ArrowRight,
  Eye,
  EyeOff,
  Highlighter,
  List,
  AlignLeft,
} from 'lucide-react';
import type { Criterion, Assessment, Evidence, ContextItem, AssessmentType, AssessmentLength, HallucinationThreshold, OverallAssessmentResult } from '@/types';
import { reviseCriterionScoreWithJustification } from '@/lib/llm-service';
import { detectParagraphBreaks } from '@/lib/essay-paragraphs';
import type { ActionLogger } from '@/lib/action-logger';
import AssessmentSection from '@/components/grading/assessment-section';
import EvidenceSection from '@/components/grading/evidence-section';
import HallucinationPanel from '@/components/grading/hallucination-panel';
import { JustificationEditor } from '@/components/grading/edit-justification-modal';
import OverallAssessment from '@/components/grading/overall-assessment';

// Highlight types for the essay text viewer
export interface PdfHighlight { text: string; criterionName: string; }

export interface TeacherHighlightView {
  id: number;
  criterionName: string;
  startIndex: number;
  endIndex: number;
  text: string;
}

// Essay text viewer with inline quote highlighting
const CRITERION_HIGHLIGHT_COLORS: Record<string, string> = {
  'Content':      'bg-yellow-200/70 dark:bg-yellow-700/40',
  'Organization': 'bg-blue-200/70  dark:bg-blue-700/40',
  'Language':     'bg-green-200/70 dark:bg-green-700/40',
};

const TEACHER_HIGHLIGHT_COLORS: Record<string, string> = {
  'Content':      'bg-pink-200/70 border-b-2 border-pink-500 dark:bg-pink-700/40 dark:border-pink-400',
  'Organization': 'bg-fuchsia-200/70 border-b-2 border-fuchsia-500 dark:bg-fuchsia-700/40 dark:border-fuchsia-400',
  'Language':     'bg-rose-200/70 border-b-2 border-rose-500 dark:bg-rose-700/40 dark:border-rose-400',
};

type SegmentSource = 'ai' | 'teacher';
interface TextSegment {
  text: string;
  criterionName?: string;
  source?: SegmentSource;
  teacherHighlightId?: number;
}

function buildSegments(
  content: string,
  aiHighlights: PdfHighlight[],
  teacherHighlights: TeacherHighlightView[],
): TextSegment[] {
  type Range = { start: number; end: number; criterionName: string; source: SegmentSource; teacherHighlightId?: number };
  const ranges: Range[] = [];

  for (const h of aiHighlights) {
    if (!h.text || h.text.length < 10) continue;
    const idx = content.indexOf(h.text);
    if (idx !== -1) ranges.push({ start: idx, end: idx + h.text.length, criterionName: h.criterionName, source: 'ai' });
  }

  for (const h of teacherHighlights) {
    if (h.startIndex < 0 || h.endIndex > content.length || h.endIndex <= h.startIndex) continue;
    ranges.push({
      start: h.startIndex,
      end: h.endIndex,
      criterionName: h.criterionName,
      source: 'teacher',
      teacherHighlightId: h.id,
    });
  }

  // Teacher highlights take precedence over AI highlights when they overlap, so
  // sort teacher first within the same start position.
  ranges.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.source !== b.source) return a.source === 'teacher' ? -1 : 1;
    return 0;
  });

  // Merge overlapping ranges of the same source; teacher highlights win when
  // they overlap an AI highlight.
  const merged: Range[] = [];
  for (const r of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && r.start < prev.end) {
      if (prev.source === r.source) {
        prev.end = Math.max(prev.end, r.end);
      } else if (r.source === 'teacher' && prev.source === 'ai') {
        // Split: keep AI prefix, then teacher segment
        const aiEnd = r.start;
        if (prev.end > r.end) {
          // AI fully contains teacher: AI-prefix, teacher, AI-suffix
          const suffix: Range = { start: r.end, end: prev.end, criterionName: prev.criterionName, source: 'ai' };
          prev.end = aiEnd;
          if (prev.end > prev.start) merged.push(r);
          if (suffix.end > suffix.start) merged.push(suffix);
        } else {
          prev.end = aiEnd;
          if (prev.end <= prev.start) merged.pop();
          merged.push(r);
        }
      } else {
        // teacher first, then AI: skip AI overlap
        if (r.end > prev.end) {
          merged.push({ ...r, start: prev.end });
        }
      }
    } else {
      merged.push({ ...r });
    }
  }

  const segments: TextSegment[] = [];
  let pos = 0;
  for (const r of merged) {
    if (r.start > pos) segments.push({ text: content.slice(pos, r.start) });
    segments.push({
      text: content.slice(r.start, r.end),
      criterionName: r.criterionName,
      source: r.source,
      teacherHighlightId: r.teacherHighlightId,
    });
    pos = r.end;
  }
  if (pos < content.length) segments.push({ text: content.slice(pos) });
  return segments;
}

type TextSize = 'sm' | 'md' | 'lg';

const TEXT_SIZE_CLS: Record<TextSize, string> = {
  sm: 'text-sm leading-7',
  md: 'text-base leading-8',
  lg: 'text-lg leading-9',
};

function computeOffset(container: HTMLElement, node: Node, offsetInNode: number): number | null {
  // Walk text nodes under `container` in document order, summing lengths until
  // we hit `node`. Returns null if `node` is not a descendant of `container`.
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current === node) {
      return offset + offsetInNode;
    }
    offset += (current.nodeValue ?? '').length;
    current = walker.nextNode();
  }
  // Handle case where node itself is the container (selection across all text)
  return null;
}

interface SelectionState {
  startIndex: number;
  endIndex: number;
  text: string;
  // viewport coordinates of the selection end for anchoring the action button
  x: number;
  y: number;
}

function EssayTextViewer({
  content,
  aiHighlights,
  teacherHighlights,
  prompt,
  textSize,
  onTextSizeChange,
  showAIHighlights,
  onToggleAIHighlights,
  activeCriterionName,
  onAddTeacherHighlight,
  onRemoveTeacherHighlight,
  canEditHighlights,
}: {
  content: string;
  aiHighlights: PdfHighlight[];
  teacherHighlights: TeacherHighlightView[];
  prompt?: string | null;
  textSize: TextSize;
  onTextSizeChange: (s: TextSize) => void;
  showAIHighlights: boolean;
  onToggleAIHighlights: () => void;
  activeCriterionName: string | null;
  onAddTeacherHighlight: (startIndex: number, endIndex: number, text: string) => void;
  onRemoveTeacherHighlight: (id: number) => void;
  canEditHighlights: boolean;
}) {
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [activeTeacherHighlightId, setActiveTeacherHighlightId] = useState<number | null>(null);

  const segments = React.useMemo(
    () => buildSegments(content, showAIHighlights ? aiHighlights : [], teacherHighlights),
    [content, showAIHighlights, aiHighlights, teacherHighlights],
  );

  const paragraphBreaks = React.useMemo(() => detectParagraphBreaks(content), [content]);

  const handleMouseUp = useCallback(() => {
    if (!canEditHighlights || !bodyRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!bodyRef.current.contains(range.startContainer) || !bodyRef.current.contains(range.endContainer)) {
      setSelection(null);
      return;
    }
    const startIdx = computeOffset(bodyRef.current, range.startContainer, range.startOffset);
    const endIdx = computeOffset(bodyRef.current, range.endContainer, range.endOffset);
    if (startIdx == null || endIdx == null || endIdx <= startIdx) {
      setSelection(null);
      return;
    }
    const text = content.slice(startIdx, endIdx);
    if (!text.trim() || text.length < 2) {
      setSelection(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setSelection({
      startIndex: startIdx,
      endIndex: endIdx,
      text,
      x: rect.right,
      y: rect.bottom,
    });
  }, [canEditHighlights, content]);

  // Dismiss selection popup on outside click
  useEffect(() => {
    if (!selection) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest?.('[data-highlight-action]')) return;
      setSelection(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [selection]);

  const handleConfirmHighlight = () => {
    if (!selection) return;
    onAddTeacherHighlight(selection.startIndex, selection.endIndex, selection.text);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  if (!content) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>No essay content</p>
      </div>
    );
  }

  const legendEntries = showAIHighlights
    ? Object.entries(CRITERION_HIGHLIGHT_COLORS).filter(([name]) =>
        aiHighlights.some((h) => h.criterionName === name),
      )
    : [];
  const teacherLegendEntries = Object.entries(TEACHER_HIGHLIGHT_COLORS).filter(([name]) =>
    teacherHighlights.some((h) => h.criterionName === name),
  );

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--background)' }}>
      {/* Toolbar */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-4 py-2"
        style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}
      >
        <div className="flex flex-wrap items-center gap-3">
          {legendEntries.map(([name, cls]) => (
            <span key={`ai-${name}`} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
              <span className={`inline-block h-3 w-3 rounded-sm ${cls}`} />
              AI · {name}
            </span>
          ))}
          {teacherLegendEntries.map(([name, cls]) => (
            <span key={`teacher-${name}`} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
              <span className={`inline-block h-3 w-3 rounded-sm ${cls}`} />
              You · {name}
            </span>
          ))}
          {legendEntries.length === 0 && teacherLegendEntries.length === 0 && (
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>Essay</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleAIHighlights}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
              showAIHighlights
                ? 'border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
            }`}
            title={showAIHighlights ? 'Hide AI highlights' : 'Show AI highlights'}
          >
            {showAIHighlights ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            AI highlights
          </button>
          <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--card-border)' }}>
            {(['sm', 'md', 'lg'] as TextSize[]).map((s) => (
              <button
                key={s}
                onClick={() => onTextSizeChange(s)}
                className={`cursor-pointer rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  textSize === s
                    ? 'bg-indigo-500 text-white'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'
                }`}
              >
                {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="relative flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-8">
          {/* Essay prompt callout */}
          {prompt && (
            <div className="mb-6 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-500 dark:bg-amber-950/30">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                Essay Prompt
              </p>
              <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
                {prompt}
              </p>
            </div>
          )}

          {/* Essay text */}
          <p
            ref={bodyRef}
            onMouseUp={handleMouseUp}
            className={`whitespace-pre-wrap font-serif text-gray-800 dark:text-slate-200 ${TEXT_SIZE_CLS[textSize]}`}
          >
            {(() => {
              // Paragraph breaks are <br/><br/> between segments rather than text,
              // so the text-node offsets that `computeOffset` walks stay correct.
              const out: React.ReactNode[] = [];
              let pos = 0;
              let key = 0;
              const renderPiece = (seg: TextSegment, text: string): React.ReactNode => {
                if (seg.source === 'teacher' && seg.criterionName) {
                  const colorCls = TEACHER_HIGHLIGHT_COLORS[seg.criterionName] ?? 'bg-pink-200/70 border-b-2 border-pink-500';
                  const id = seg.teacherHighlightId!;
                  const isActive = activeTeacherHighlightId === id;
                  return (
                    <mark
                      key={key++}
                      className={`relative cursor-pointer rounded-sm px-0.5 ${colorCls}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTeacherHighlightId((cur) => (cur === id ? null : id));
                      }}
                    >
                      {text}
                      {isActive && (
                        <button
                          data-highlight-action
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveTeacherHighlight(id);
                            setActiveTeacherHighlightId(null);
                          }}
                          className="absolute -top-3 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow"
                          title="Remove highlight"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </mark>
                  );
                }
                if (seg.criterionName) {
                  const colorCls = CRITERION_HIGHLIGHT_COLORS[seg.criterionName] ?? 'bg-yellow-200/70 dark:bg-yellow-700/40';
                  return <mark key={key++} className={`rounded-sm px-0.5 ${colorCls}`}>{text}</mark>;
                }
                return <span key={key++}>{text}</span>;
              };
              const emitBreak = () => {
                out.push(<br key={key++} />);
                out.push(<br key={key++} />);
              };

              for (const seg of segments) {
                const segStart = pos;
                const segEnd = pos + seg.text.length;
                // Break landing exactly at the start of this (non-first) segment.
                if (segStart > 0 && paragraphBreaks.includes(segStart)) {
                  emitBreak();
                }
                // Breaks strictly inside the segment split it into sub-pieces.
                const inner = paragraphBreaks.filter((b) => b > segStart && b < segEnd);
                if (inner.length === 0) {
                  out.push(renderPiece(seg, seg.text));
                } else {
                  let local = 0;
                  for (const b of inner) {
                    const cut = b - segStart;
                    if (cut > local) out.push(renderPiece(seg, seg.text.slice(local, cut)));
                    emitBreak();
                    local = cut;
                  }
                  if (local < seg.text.length) out.push(renderPiece(seg, seg.text.slice(local)));
                }
                pos = segEnd;
              }
              return out;
            })()}
          </p>
        </div>

        {/* Floating highlight-action button anchored to current text selection */}
        {selection && activeCriterionName && (
          <div
            data-highlight-action
            style={{ position: 'fixed', left: selection.x + 4, top: selection.y + 4, zIndex: 30 }}
          >
            <button
              onClick={handleConfirmHighlight}
              className="flex cursor-pointer items-center gap-1.5 rounded-md bg-pink-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-pink-600"
            >
              <Highlighter className="h-3.5 w-3.5" />
              Highlight as {activeCriterionName}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export interface InteractiveGradingProps {
  /* data */
  pdfContent: string;
  rubricContent: string;
  rubricCriteria: Criterion[];
  criteriaAssessments: Record<string, Assessment>;
  currentCriterionIndex: number;
  teacherScores: Record<string, number | null>;
  showAIScores: Record<string, boolean>;
  contextList: ContextItem[];
  assessmentType: AssessmentType;
  assessmentLength: AssessmentLength;
  hallucinationThreshold: HallucinationThreshold;
  gradingComplete: boolean;
  overallAssessment: OverallAssessmentResult | null;

  /* actions */
  handleTeacherScoreInput: (criterionId: string, score: number) => void;
  revealAIScore: (criterionId: string) => void;
  moveToNextCriterion: () => void;
  moveToPreviousCriterion: () => void;
  finishGrading: () => Promise<void>;
  restartGrading: () => void;
  gradeCurrentCriterion: (criteria: Criterion[], index: number) => Promise<void>;
  setCriteriaAssessments: React.Dispatch<React.SetStateAction<Record<string, Assessment>>>;

  /* timing */
  criterionStartTime: number | null;

  /* pdf evidence */
  activePdfEvidence: Evidence | null;
  setActivePdfEvidence: React.Dispatch<React.SetStateAction<Evidence | null>>;

  /* settings */
  setAssessmentType: (type: AssessmentType) => void;

  /* teacher justification */
  teacherJustifications: Record<string, string>;
  onTeacherJustificationChange: (criterionId: string, text: string) => void;

  /* new navigation callbacks */
  onRevisitCriteria?: () => void;
  onBackToCohort?: () => void;
  onBackToList?: () => void;
  onHallucinationUpdate?: (criterionName: string, counts: { detected: number; confirmed: number; reported: number }) => void;
  onSetBenchmark?: () => Promise<void>;
  essayPrompt?: string | null;
  actionLogger?: ActionLogger | null;
  essayId?: string | null;
  sessionId?: string | null;
}

export default function InteractiveGrading({
  pdfContent,
  rubricContent,
  rubricCriteria,
  criteriaAssessments,
  currentCriterionIndex,
  teacherScores,
  showAIScores,
  contextList,
  assessmentType,
  assessmentLength,
  hallucinationThreshold,
  gradingComplete,
  overallAssessment,
  handleTeacherScoreInput,
  revealAIScore,
  moveToNextCriterion,
  moveToPreviousCriterion,
  finishGrading,
  restartGrading,
  gradeCurrentCriterion,
  setCriteriaAssessments,
  criterionStartTime,
  activePdfEvidence,
  setActivePdfEvidence,
  setAssessmentType,
  teacherJustifications,
  onTeacherJustificationChange,
  onRevisitCriteria,
  onBackToCohort,
  onBackToList,
  onHallucinationUpdate,
  onSetBenchmark,
  essayPrompt,
  actionLogger,
  essayId,
  sessionId,
}: InteractiveGradingProps) {
  // internal state
  const [editingJustification, setEditingJustification] = useState(false);
  const [textSize, setTextSize] = useState<TextSize>('md');
  const [showAIHighlights, setShowAIHighlights] = useState(false);
  const [teacherHighlights, setTeacherHighlights] = useState<TeacherHighlightView[]>([]);
  const [benchmarkJustSet, setBenchmarkJustSet] = useState(false);
  const [editedJustification, setEditedJustification] = useState('');
  const [editedBullets, setEditedBullets] = useState<string[]>([]);
  const [hoveredAssessmentIndexes, setHoveredAssessmentIndexes] = useState<number[]>([]);
  const [isRevisingScore, setIsRevisingScore] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [showHallucinationPopup, setShowHallucinationPopup] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [hoveredEvidenceIndex, setHoveredEvidenceIndex] = useState<number | null>(null);

  // draggable split pane
  const [leftPct, setLeftPct] = useState(60);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(75, Math.max(30, pct)));
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

  // derived
  const criterion = rubricCriteria[currentCriterionIndex] ?? null;
  const criterionId = criterion?.name ?? '';
  const assessment = criterionId ? criteriaAssessments[criterionId] : undefined;
  const teacherScore = criterionId ? teacherScores[criterionId] ?? null : null;
  const aiScoreRevealed = criterionId ? showAIScores[criterionId] ?? false : false;
  const isFirstCriterion = currentCriterionIndex === 0;
  const isLastCriterion = currentCriterionIndex === rubricCriteria.length - 1;
  const totalCriteria = rubricCriteria.length;

  const scoreOptions = useMemo(() => {
    if (!criterion) return [];
    const opts: number[] = [];
    for (let i = criterion.scoreRange.min; i <= criterion.scoreRange.max; i++) {
      opts.push(i);
    }
    return opts;
  }, [criterion]);

  // build highlights from all assessed criteria evidence + justification quotes
  const pdfHighlights = useMemo<PdfHighlight[]>(() => {
    const result: PdfHighlight[] = [];
    for (const [name, a] of Object.entries(criteriaAssessments)) {
      // Dedup only within the same criterion
      const seenInCriterion = new Set<string>();
      if (a?.evidence) {
        for (const ev of a.evidence) {
          const key = ev.quote.toLowerCase().trim();
          if (!seenInCriterion.has(key)) {
            seenInCriterion.add(key);
            result.push({ text: ev.quote, criterionName: name });
          }
        }
      }
      // Also extract inline quotes from justification (text between quotation marks)
      if (a?.justification) {
        const justText = typeof a.justification === 'string' ? a.justification : a.justification.join(' ');
        const quoteMatches = justText.match(/[""\u201C\u201D]([^""\u201C\u201D]{20,}?)[""\u201C\u201D]/g);
        if (quoteMatches) {
          for (const m of quoteMatches) {
            const cleaned = m.replace(/^[""\u201C\u201D]|[""\u201C\u201D]$/g, '').trim();
            const key = cleaned.toLowerCase();
            if (cleaned.length >= 20 && !seenInCriterion.has(key)) {
              seenInCriterion.add(key);
              result.push({ text: cleaned, criterionName: name });
            }
          }
        }
      }
    }
    return result;
  }, [criteriaAssessments]);

  // loading state detection
  const isInitialLoading = rubricCriteria.length > 0 && Object.keys(criteriaAssessments).length === 0;
  const isCriterionLoading = criterion != null && !assessment;

  /* reset state on criterion change */
  useEffect(() => {
    setShowHallucinationPopup(false);
    setGradingError(null);
    setEditingJustification(false);
    setEditedJustification('');
    setEditedBullets([]);
    setBenchmarkJustSet(false);
  }, [currentCriterionIndex]);

  /* AI highlights toggle: reset to OFF on essay change (user-study feedback) */
  useEffect(() => {
    setShowAIHighlights(false);
  }, [essayId]);

  /* Load teacher highlights for the current essay */
  useEffect(() => {
    if (!sessionId || !essayId) {
      setTeacherHighlights([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/sessions/${sessionId}/highlights?essayId=${essayId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows = (data.highlights ?? []) as Array<{
          id: number; criterion_name: string; start_index: number; end_index: number; text: string;
        }>;
        setTeacherHighlights(rows.map((r) => ({
          id: r.id,
          criterionName: r.criterion_name,
          startIndex: r.start_index,
          endIndex: r.end_index,
          text: r.text,
        })));
      })
      .catch(() => { if (!cancelled) setTeacherHighlights([]); });
    return () => { cancelled = true; };
  }, [sessionId, essayId]);

  const handleToggleAIHighlights = useCallback(() => {
    setShowAIHighlights((prev) => {
      const next = !prev;
      actionLogger?.log('evidence_highlight_toggled', {
        visible: next,
        criterionName: criterionId,
      }, essayId ?? undefined);
      return next;
    });
  }, [actionLogger, criterionId, essayId]);

  const handleAddTeacherHighlight = useCallback(async (startIndex: number, endIndex: number, text: string) => {
    if (!sessionId || !essayId || !criterionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ essayId, criterionName: criterionId, startIndex, endIndex, text }),
      });
      if (!res.ok) return;
      const { id } = await res.json();
      setTeacherHighlights((prev) => [...prev, { id, criterionName: criterionId, startIndex, endIndex, text }]);
      actionLogger?.log('teacher_highlight_added', {
        criterionName: criterionId,
        startIndex,
        endIndex,
        length: endIndex - startIndex,
      }, essayId);
    } catch (err) {
      console.error('Failed to add teacher highlight:', err);
    }
  }, [sessionId, essayId, criterionId, actionLogger]);

  const handleRemoveTeacherHighlight = useCallback(async (id: number) => {
    if (!sessionId) return;
    const removed = teacherHighlights.find((h) => h.id === id);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/highlights?id=${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) return;
      setTeacherHighlights((prev) => prev.filter((h) => h.id !== id));
      if (removed) {
        actionLogger?.log('teacher_highlight_removed', {
          criterionName: removed.criterionName,
          startIndex: removed.startIndex,
          endIndex: removed.endIndex,
        }, essayId ?? undefined);
      }
    } catch (err) {
      console.error('Failed to remove teacher highlight:', err);
    }
  }, [sessionId, teacherHighlights, actionLogger, essayId]);

  const handleSaveJustification = useCallback(
    async (newJustification: string, newBullets: string[]) => {
      if (!criterion || !assessment) return;

      const originalJustificationStr = typeof assessment.justification === 'string'
        ? assessment.justification
        : assessment.justification.join('\n');

      /* For bullets: the actual edited text is the bullets joined.
         For flow: it's the newJustification string directly. */
      const isBullets = assessmentType === 'bullets' && newBullets.length > 0;
      const updatedJustification = isBullets ? newBullets : newJustification;
      const editedTextForApi = isBullets ? newBullets.join('\n') : newJustification;

      /* immediately update justification in UI */
      setCriteriaAssessments((prev) => ({
        ...prev,
        [criterionId]: {
          ...prev[criterionId],
          justification: updatedJustification,
        },
      }));

      setEditingJustification(false);

      actionLogger?.log('justification_edited', {
        criterionName: criterion.name,
        criterionId: criterion.id,
        originalJustification: originalJustificationStr,
        editedJustification: editedTextForApi,
      }, essayId ?? undefined);

      /* async: revise score based on new justification */
      setIsRevisingScore(true);
      try {
        const result = await reviseCriterionScoreWithJustification(
          pdfContent,
          criterion,
          originalJustificationStr,
          editedTextForApi,
          assessment.score,
        );

        actionLogger?.log('llm_reassessment_complete', {
          criterionName: criterion.name,
          criterionId: criterion.id,
          originalScore: assessment.score,
          revisedScore: result.revisedScore,
          revisionRationale: result.rationale,
        }, essayId ?? undefined);

        setCriteriaAssessments((prev) => ({
          ...prev,
          [criterionId]: {
            ...prev[criterionId],
            score: result.revisedScore,
            aiScore: result.revisedScore,
            justification: updatedJustification,
            revisionRationale: result.rationale,
            revisedAssessmentText: editedTextForApi,
          },
        }));
      } catch (err) {
        console.error('Error revising score:', err);
        setGradingError(
          err instanceof Error ? err.message : 'Failed to revise score based on edits.'
        );
      } finally {
        setIsRevisingScore(false);
      }
    },
    [criterion, assessment, criterionId, assessmentType, pdfContent, setCriteriaAssessments]
  );

  const handleFinishGrading = useCallback(async () => {
    setIsFinishing(true);
    setGradingError(null);
    try {
      /* grade last criterion if it hasn't been graded yet */
      if (criterion && !assessment) {
        await gradeCurrentCriterion(rubricCriteria, currentCriterionIndex);
      }
      await finishGrading();
    } catch (err) {
      console.error('Error finishing grading:', err);
      setGradingError(
        err instanceof Error ? err.message : 'Failed to finish grading.'
      );
    } finally {
      setIsFinishing(false);
    }
  }, [criterion, assessment, gradeCurrentCriterion, rubricCriteria, currentCriterionIndex, finishGrading]);

  const handleNext = useCallback(async () => {
    setIsProcessing(true);
    setGradingError(null);
    try {
      moveToNextCriterion();
    } catch (err) {
      console.error('Error moving to next:', err);
      setGradingError(err instanceof Error ? err.message : 'Error advancing criterion.');
    } finally {
      setIsProcessing(false);
    }
  }, [moveToNextCriterion]);

  // Grading complete: show the overall assessment
  if (gradingComplete && overallAssessment) {
    const assessmentsArray = rubricCriteria.map((c) => criteriaAssessments[c.name]).filter(Boolean);
    return (
      <OverallAssessment
        overallAssessment={overallAssessment}
        criteriaAssessments={assessmentsArray}
        teacherScores={teacherScores}
        onRevisitCriteria={onRevisitCriteria}
        onBackToCohort={onBackToCohort}
        onBackToList={onBackToList}
      />
    );
  }

  // Main grading UI
  const previousScore = assessment?.originalAiScore ?? null;
  const revisionRationale = assessment?.revisionRationale ?? null;
  const progressPct = totalCriteria > 0 ? ((currentCriterionIndex + 1) / totalCriteria) * 100 : 0;

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-4rem)] w-full">
      {/* Left column: grading controls */}
      <div className="relative flex flex-col overflow-y-auto border-r border-gray-200 dark:border-slate-700" style={{ width: `${leftPct}%` }}>
        {/* Error banner */}
        <AnimatePresence>
          {gradingError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-4 mt-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-[#EF4444]" />
                <p className="text-sm text-[#EF4444]">{gradingError}</p>
              </div>
              <button
                onClick={() => setGradingError(null)}
                className="cursor-pointer rounded p-1 text-[#EF4444] transition-colors hover:bg-red-100 dark:hover:bg-red-900/40"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-6 p-6">
          {/* Progress bar */}
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-[#1E1B4B] dark:text-[#E2E8F0]">
                Criterion {currentCriterionIndex + 1} of {totalCriteria}
              </span>
              <span className="text-gray-500 dark:text-slate-400">
                {Math.round(progressPct)}% complete
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8]"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Flow / Bullet toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400 dark:text-slate-500">Format:</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              <button
                onClick={() => setAssessmentType('flow')}
                className={`cursor-pointer flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  assessmentType === 'flow'
                    ? 'bg-white text-[#6366F1] shadow-sm dark:bg-slate-700 dark:text-[#818CF8]'
                    : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <AlignLeft className="h-3 w-3" />
                Paragraph
              </button>
              <button
                onClick={() => setAssessmentType('bullets')}
                className={`cursor-pointer flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  assessmentType === 'bullets'
                    ? 'bg-white text-[#6366F1] shadow-sm dark:bg-slate-700 dark:text-[#818CF8]'
                    : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <List className="h-3 w-3" />
                Bullets
              </button>
            </div>
          </div>

          {/* Criterion card */}
          {criterion && (
            <motion.div
              key={criterionId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <h3 className="mb-3 text-lg font-bold text-[#1E1B4B] dark:text-[#E2E8F0]">
                {criterion.name}
              </h3>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-slate-500">
                Score range: {criterion.scoreRange.min} &ndash; {criterion.scoreRange.max}
              </p>
              <div className="space-y-2">
                {criterion.levels.map((level) => (
                  <div
                    key={level.score}
                    className="flex gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-slate-700/50"
                  >
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#F5F3FF] text-xs font-bold text-[#6366F1] dark:bg-slate-700 dark:text-[#818CF8]">
                      {level.score}
                    </span>
                    <p className="text-gray-500 dark:text-slate-400">
                      {level.description}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Error with retry */}
          {assessment?.error && (
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-950/20">
              <div className="flex items-center gap-2">
                {isRetrying ? (
                  <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-[#6366F1]" />
                ) : (
                  <AlertCircle className="h-5 w-5 flex-shrink-0 text-[#EF4444]" />
                )}
                <div>
                  <p className={`text-sm font-medium ${isRetrying ? 'text-[#6366F1]' : 'text-[#EF4444]'}`}>
                    {isRetrying ? 'Retrying assessment...' : 'Failed to grade this criterion'}
                  </p>
                  {!isRetrying && (
                    <p className="mt-0.5 text-xs text-red-400">
                      {assessment.error === 'EMPTY_RESPONSE' ? 'The AI returned an empty response.' :
                       assessment.error === 'MODEL_OVERLOADED' ? 'The AI model is overloaded. Try again in a moment.' :
                       assessment.error === 'REQUEST_FAILED' ? 'Network error — check your connection.' :
                       assessment.error}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={async () => {
                  setIsRetrying(true);
                  // Clear the error assessment so grading can re-run
                  setCriteriaAssessments((prev) => {
                    const next = { ...prev };
                    delete next[criterionId];
                    return next;
                  });
                  try {
                    await gradeCurrentCriterion(rubricCriteria, currentCriterionIndex);
                  } finally {
                    setIsRetrying(false);
                  }
                }}
                disabled={isRetrying}
                className="cursor-pointer flex-shrink-0 rounded-lg bg-[#EF4444] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRetrying ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Retrying...
                  </span>
                ) : (
                  'Retry'
                )}
              </button>
            </div>
          )}

          {/* Assessment section (or inline editor) */}
          {assessment && !assessment.error && !editingJustification && (
            <AssessmentSection
              assessmentType={assessmentType}
              currentAssessment={assessment}
              hoveredAssessmentIndexes={hoveredAssessmentIndexes}
              setHoveredAssessmentIndexes={setHoveredAssessmentIndexes}
              onEditClick={() => {
                /* Populate edit state from current assessment */
                const just = assessment.justification;
                if (Array.isArray(just)) {
                  setEditedBullets([...just]);
                  setEditedJustification(just.join('\n'));
                } else {
                  setEditedJustification(just);
                  setEditedBullets([]);
                }
                setEditingJustification(true);
              }}
            />
          )}
          {assessment && !assessment.error && editingJustification && (
            <JustificationEditor
              initialValue={editedJustification}
              isBullets={assessmentType === 'bullets' && Array.isArray(assessment.justification)}
              initialBullets={editedBullets}
              warningText="Editing will update AI score"
              onCancel={() => setEditingJustification(false)}
              onSave={(value: string, bullets?: string[]) => {
                const filteredBullets = (bullets ?? []).filter((b) => b.trim());
                handleSaveJustification(value, filteredBullets);
              }}
            />
          )}

          {/* Evidence section */}
          {assessment && !assessment.error && (
            <EvidenceSection
              showEvidence={showEvidence}
              setShowEvidence={setShowEvidence}
              currentAssessment={assessment}
              hoveredEvidenceIndex={hoveredEvidenceIndex}
              setHoveredEvidenceIndex={setHoveredEvidenceIndex}
              hoveredAssessmentIndexes={hoveredAssessmentIndexes}
              setHoveredAssessmentIndexes={setHoveredAssessmentIndexes}
            />
          )}

          {/* Hallucination panel */}
          {assessment && !assessment.error && (
            <HallucinationPanel
              essayContent={pdfContent}
              evidenceQuotes={assessment.evidence}
              hallucinationThreshold={hallucinationThreshold}
              criterionName={criterionId}
              onHallucinationDetected={(detected) => {
                onHallucinationUpdate?.(criterionId, {
                  detected: detected.length,
                  confirmed: detected.filter((h) => h.status === 'confirmed').length,
                  reported: 0,
                });
              }}
              onHallucinationReported={() => {
                onHallucinationUpdate?.(criterionId, {
                  detected: 0,
                  confirmed: 0,
                  reported: 1,
                });
              }}
            />
          )}

          {/* Scoring section */}
          {criterion && assessment && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                Scoring
              </h4>

              <div className="grid grid-cols-2 gap-6">
                {/* Teacher score */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
                    Your Score
                  </label>
                  <select
                    value={teacherScore ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) handleTeacherScoreInput(criterionId, parseInt(val, 10));
                    }}
                    className="w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#1E1B4B] transition-colors focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-700 dark:text-[#E2E8F0] dark:focus:border-[#818CF8]"
                  >
                    <option value="">Select score...</option>
                    {scoreOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  {/* Benchmark button (DC only, after the teacher has scored) */}
                  {onSetBenchmark && teacherScore !== null && (
                    benchmarkJustSet ? (
                      <div className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Set as benchmark
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          await onSetBenchmark();
                          setBenchmarkJustSet(true);
                          setTimeout(() => setBenchmarkJustSet(false), 2500);
                        }}
                        className="mt-2 w-full cursor-pointer rounded-md bg-indigo-500/10 px-2 py-1.5 text-[11px] font-semibold text-indigo-500 transition-colors hover:bg-indigo-500/20"
                      >
                        Set as score {teacherScore} benchmark
                      </button>
                    )
                  )}
                </div>

                {/* AI score */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
                    AI Score
                  </label>

                  {!aiScoreRevealed ? (
                    <button
                      onClick={() => revealAIScore(criterionId)}
                      disabled={teacherScore === null}
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#6366F1]/30 bg-[#F5F3FF] px-4 py-2.5 text-sm font-medium text-[#6366F1] transition-all hover:border-[#6366F1]/60 hover:bg-[#EEF2FF] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#6366F1]/30 disabled:hover:bg-[#F5F3FF] dark:border-[#818CF8]/30 dark:bg-slate-700 dark:text-[#818CF8] dark:hover:border-[#818CF8]/60 dark:hover:bg-slate-600 dark:disabled:hover:bg-slate-700"
                    >
                      <Eye className="h-4 w-4" />
                      Reveal AI Score
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {/* Show previous vs revised if revision occurred */}
                      {previousScore !== null && previousScore !== assessment.score ? (
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-400 line-through dark:bg-slate-700 dark:text-slate-500">
                            {previousScore}
                          </span>
                          <ArrowRight className="h-4 w-4 text-[#6366F1] dark:text-[#818CF8]" />
                          <motion.span
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="rounded-lg bg-[#6366F1] px-3 py-2 text-sm font-bold text-white"
                          >
                            {assessment.score}
                          </motion.span>
                        </div>
                      ) : (
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="flex h-[42px] w-full items-center justify-center rounded-lg bg-[#6366F1] text-lg font-bold text-white"
                        >
                          {assessment.score}
                        </motion.div>
                      )}

                      {/* Revising state */}
                      {isRevisingScore && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-2 text-xs text-[#F59E0B]"
                        >
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Revising score based on edits...
                        </motion.div>
                      )}

                      {/* Revision rationale */}
                      {revisionRationale && !isRevisingScore && (
                        <motion.p
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-lg bg-[#F5F3FF] px-3 py-2 text-xs text-gray-600 dark:bg-slate-700 dark:text-slate-400"
                        >
                          {revisionRationale}
                        </motion.p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Teacher justification */}
          {criterion && assessment && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <label className="mb-2 block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
                Your Justification
              </label>
              <textarea
                value={teacherJustifications[criterionId] ?? ''}
                onChange={(e) => onTeacherJustificationChange(criterionId, e.target.value)}
                rows={3}
                placeholder="Write your reasoning for the score above..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-[#1E1B4B] outline-none transition-colors focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-700 dark:text-[#E2E8F0]"
              />
            </div>
          )}

          {/* Navigation row */}
          <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-slate-700">
            <button
              onClick={moveToPreviousCriterion}
              disabled={isFirstCriterion}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-[#1E1B4B] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-[#E2E8F0] dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>

            <div className="flex items-center gap-3">
              {!isLastCriterion ? (
                <button
                  onClick={handleNext}
                  disabled={isProcessing}
                  className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#6366F1] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5558E6] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleFinishGrading}
                  disabled={isFinishing}
                  className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#10B981] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0EA572] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFinishing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Finishing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Finish Grading
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Criterion loading overlay */}
        <AnimatePresence>
          {isCriterionLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-sm"
            >
              <div className="rounded-xl bg-white/90 p-8 shadow-lg dark:bg-slate-800/90">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="mx-auto w-fit"
                >
                  <Loader2 className="h-10 w-10 text-[#6366F1]" />
                </motion.div>
                <p className="mt-4 text-sm font-medium text-gray-500 dark:text-slate-400">
                  AI is grading {criterion?.name ?? 'criterion'}…
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Processing overlay */}
        <AnimatePresence>
          {(isProcessing || isFinishing) && !isCriterionLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[2px] dark:bg-slate-900/60"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="h-10 w-10 text-[#6366F1]" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Draggable divider */}
      <div
        onMouseDown={handleDividerMouseDown}
        className="group relative z-20 flex w-1.5 cursor-col-resize items-center justify-center bg-gray-200 transition-colors hover:bg-[#6366F1]/40 active:bg-[#6366F1]/60 dark:bg-slate-700 dark:hover:bg-[#818CF8]/40"
      >
        <div className="h-8 w-1 rounded-full bg-gray-400 transition-colors group-hover:bg-[#6366F1] dark:bg-slate-500 dark:group-hover:bg-[#818CF8]" />
      </div>

      {/* Essay text */}
      <div className="h-full overflow-hidden" style={{ width: `${100 - leftPct}%` }}>
        <EssayTextViewer
          content={pdfContent}
          aiHighlights={pdfHighlights}
          teacherHighlights={teacherHighlights}
          prompt={essayPrompt}
          textSize={textSize}
          onTextSizeChange={setTextSize}
          showAIHighlights={showAIHighlights}
          onToggleAIHighlights={handleToggleAIHighlights}
          activeCriterionName={criterionId || null}
          onAddTeacherHighlight={handleAddTeacherHighlight}
          onRemoveTeacherHighlight={handleRemoveTeacherHighlight}
          canEditHighlights={Boolean(sessionId && essayId && criterionId)}
        />
      </div>
    </div>
  );
}

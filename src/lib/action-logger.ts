export type ActionType =
  | 'session_start' | 'session_end'
  | 'rubric_reviewed'
  | 'processing_started' | 'processing_complete'
  | 'dashboard_viewed'
  | 'topic_selected' | 'topic_reassigned' | 'topic_manually_reassigned'
  | 'essay_sort_changed'
  | 'essay_flagged' | 'essay_unflagged'
  | 'help_tooltip_opened'
  | 'essay_opened' | 'essay_closed'
  | 'criterion_navigated'
  | 'ai_grading_started' | 'ai_grading_complete'
  | 'teacher_score_assigned' | 'ai_score_revealed'
  | 'justification_edited' | 'teacher_justification_written'
  | 'evidence_highlight_toggled'
  | 'teacher_highlight_added' | 'teacher_highlight_removed'
  | 'similar_essay_viewed' | 'similar_essay_opened'
  | 'benchmark_set' | 'benchmark_removed'
  | 'benchmark_comparison_opened' | 'benchmark_comparison_closed'
  | 'grade_submitted' | 'all_grades_submitted'
  | 'grades_restored'
  | 'llm_reassessment_complete'
  | 'quality_rank_updated';

export class ActionLogger {
  constructor(
    private sessionId: string,
    private participantId: string,
    private condition: string,
    private essaySet: string,
  ) {}

  async log(
    action: ActionType,
    detail?: Record<string, unknown>,
    essayId?: string,
  ): Promise<void> {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          participantId: this.participantId,
          condition: this.condition,
          essaySet: this.essaySet,
          essayId: essayId ?? null,
          actionType: action,
          actionDetail: detail ? JSON.stringify(detail) : null,
        }),
      });
    } catch {
      // Fire-and-forget — never block UI
    }
  }
}

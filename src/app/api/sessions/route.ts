import { NextRequest, NextResponse } from 'next/server';
import { createSession, findResumableSession, logAction } from '@/lib/db-helpers';
import { loadEssaySet, getRubricContent, isEssaySet } from '@/lib/essay-loader';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { participantId, condition, essaySet, usePrecomputedTopics, precomputedK, precomputeGrades, useCachedAssessments, assessmentType, assessmentLength } = body as {
      participantId: string;
      condition: 'baseline' | 'dashboard';
      essaySet: string;
      usePrecomputedTopics?: boolean;
      precomputedK?: number;
      precomputeGrades?: boolean;
      useCachedAssessments?: boolean;
      assessmentType?: string;
      assessmentLength?: string;
    };

    if (!participantId || !condition || !essaySet) {
      return NextResponse.json({ error: 'participantId, condition, and essaySet are required' }, { status: 400 });
    }
    if (!isEssaySet(essaySet)) {
      return NextResponse.json({ error: `Unknown essay set "${essaySet}" — add data/subset_${essaySet}.csv` }, { status: 400 });
    }

    const db = getDb();

    // Resume an unfinished session with the same participantId, condition and
    // essaySet. Don't call loadEssaySet here, it would re-seed the essay rows.
    const existing = findResumableSession(participantId, condition, essaySet);
    if (existing) {
      logAction(existing.id, participantId, condition, essaySet, 'session_start', undefined, { resumed: true });

      const existingEssays = db.prepare(
        'SELECT id, filename, pdf_content, essay_prompt, word_count, grading_status, overall_grade, avg_ai_score, summary, topic_id FROM essays WHERE session_id = ? ORDER BY filename'
      ).all(existing.id) as Array<{
        id: string;
        filename: string;
        pdf_content: string;
        essay_prompt: string | null;
        word_count: number | null;
        grading_status: string;
        overall_grade: number | null;
        avg_ai_score: number | null;
        summary: string | null;
        topic_id: number | null;
      }>;

      const existingMetas = existingEssays.map((e) => ({
        id: e.id,
        filename: e.filename,
        content: e.pdf_content,
        prompt: e.essay_prompt,
        wordCount: e.word_count,
        gradingStatus: e.grading_status,
        overallGrade: e.overall_grade,
        avgAiScore: e.avg_ai_score,
        summary: e.summary,
        topicId: e.topic_id,
      }));

      return NextResponse.json({
        sessionId: existing.id,
        rubricContent: existing.rubric_content,
        essays: existingMetas,
        precomputeGrades: existing.precompute_grades === 1,
        resumed: true,
      });
    }

    const rubricContent = getRubricContent();
    const sessionId = createSession(
      participantId, condition, essaySet, rubricContent,
      usePrecomputedTopics ?? false,
      precomputedK ?? null,
      precomputeGrades ?? true,
      useCachedAssessments ?? false,
      assessmentType ?? 'flow',
      assessmentLength ?? 'medium',
    );
    await loadEssaySet(sessionId, essaySet);

    logAction(sessionId, participantId, condition, essaySet, 'session_start');

    // Return essays with full content for in-memory use
    const essays = db.prepare(
      'SELECT id, filename, pdf_content, essay_prompt, word_count, grading_status, overall_grade, avg_ai_score, summary, topic_id FROM essays WHERE session_id = ? ORDER BY filename'
    ).all(sessionId) as Array<{
      id: string;
      filename: string;
      pdf_content: string;
      essay_prompt: string | null;
      word_count: number | null;
      grading_status: string;
      overall_grade: number | null;
      avg_ai_score: number | null;
      summary: string | null;
      topic_id: number | null;
    }>;

    const essayMetas = essays.map((e) => ({
      id: e.id,
      filename: e.filename,
      content: e.pdf_content,
      prompt: e.essay_prompt,
      wordCount: e.word_count,
      gradingStatus: e.grading_status,
      overallGrade: e.overall_grade,
      avgAiScore: e.avg_ai_score,
      summary: e.summary,
      topicId: e.topic_id,
    }));

    return NextResponse.json({ sessionId, rubricContent, essays: essayMetas, precomputeGrades: precomputeGrades ?? true, resumed: false });
  } catch (error) {
    console.error('POST /api/sessions error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}

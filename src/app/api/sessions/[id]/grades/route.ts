import { NextRequest, NextResponse } from 'next/server';
import { upsertGrade, getGrades, getSession, updateEssayAiQuality, computeQualityRanks, logAction } from '@/lib/db-helpers';
import { getDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await params;
    const { searchParams } = new URL(_request.url);
    const essayId = searchParams.get('essayId');
    if (!essayId) {
      return NextResponse.json({ error: 'Missing essayId' }, { status: 400 });
    }
    const grades = getGrades(sessionId, essayId);
    return NextResponse.json({ grades });
  } catch (err) {
    console.error('[api/grades GET]', err);
    return NextResponse.json({ error: 'Failed to fetch grades' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const {
      essayId,
      criterionName,
      criterionId,
      teacher_score,
      ai_score,
      original_ai_score,
      teacher_justification,
      ai_justification,
      evidence_json,
    } = body;

    if (!essayId || !criterionName || criterionId == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    upsertGrade(sessionId, essayId, criterionName, Number(criterionId), {
      teacher_score: teacher_score ?? null,
      ai_score: ai_score ?? null,
      original_ai_score: original_ai_score ?? null,
      teacher_justification: teacher_justification ?? null,
      ai_justification: ai_justification ?? null,
      evidence_json: evidence_json ?? null,
    });

    // Once there's a teacher score, move the essay from 'pending' to 'grading' so
    // the cohort dashboard shows partial progress. 'graded' is set by finishGrading.
    if (teacher_score !== undefined && teacher_score !== null) {
      const db = getDb();
      db.prepare(`
        UPDATE essays SET grading_status = 'grading'
        WHERE id = ? AND session_id = ? AND grading_status != 'graded'
      `).run(essayId, sessionId);
    }

    // Update avg_ai_score and log quality rank snapshot when an AI score is written
    if (ai_score !== undefined && ai_score !== null) {
      updateEssayAiQuality(essayId, sessionId);
      const session = getSession(sessionId);
      if (session) {
        const ranks = computeQualityRanks(sessionId);
        logAction(sessionId, session.participant_id, session.condition, session.essay_set,
          'quality_rank_updated', undefined, ranks);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/grades POST]', err);
    return NextResponse.json({ error: 'Failed to upsert grade' }, { status: 500 });
  }
}

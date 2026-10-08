import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTopicsBySession, getSessionStats, completeSession } from '@/lib/db-helpers';
import { getDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const db = getDb();
    const essays = db.prepare(
      'SELECT id, filename, pdf_content, essay_prompt, word_count, grading_status, overall_grade, avg_ai_score, summary, topic_id FROM essays WHERE session_id = ? ORDER BY filename'
    ).all(id) as Array<{
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

    const topics = getTopicsBySession(id);
    const stats = getSessionStats(id);

    const totalEssays = (db.prepare('SELECT COUNT(*) as n FROM essays WHERE session_id = ?').get(id) as { n: number }).n;
    const summarisedCount = (db.prepare('SELECT COUNT(*) as n FROM essays WHERE session_id = ? AND summary IS NOT NULL').get(id) as { n: number }).n;
    const topicsCount = (db.prepare('SELECT COUNT(*) as n FROM essays WHERE session_id = ? AND topic_id IS NOT NULL').get(id) as { n: number }).n;
    const similaritiesCount = (db.prepare('SELECT COUNT(DISTINCT essay_id_a) as n FROM essay_similarities WHERE session_id = ?').get(id) as { n: number }).n;
    // Precompute progress: the precompute loop logs one quality_rank_updated
    // event per essay when it's done with it (even if some criteria failed).
    const precomputedCount = (db.prepare(
      "SELECT COUNT(*) as n FROM action_logs WHERE session_id = ? AND action_type = 'quality_rank_updated'"
    ).get(id) as { n: number }).n;
    const progress = { total: totalEssays, summarised: summarisedCount, topics: topicsCount, similarities: similaritiesCount, precomputed: precomputedCount };

    return NextResponse.json({ session, essays: essayMetas, topics, stats, progress });
  } catch (error) {
    console.error('GET /api/sessions/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch session' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (body.complete) {
      completeSession(id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/sessions/[id] error:', err);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}

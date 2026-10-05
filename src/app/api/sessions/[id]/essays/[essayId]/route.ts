import { NextRequest, NextResponse } from 'next/server';
import { getEssay, getGrades, updateEssayGrade, updateEssayFlag, updateEssayTopic } from '@/lib/db-helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; essayId: string }> },
) {
  try {
    const { id, essayId } = await params;
    const essay = getEssay(essayId);

    if (!essay || essay.session_id !== id) {
      return NextResponse.json({ error: 'Essay not found' }, { status: 404 });
    }

    const grades = getGrades(id, essayId);
    return NextResponse.json({ essay, grades });
  } catch (err) {
    console.error('[api/essays/[essayId] GET]', err);
    return NextResponse.json({ error: 'Failed to fetch essay' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; essayId: string }> },
) {
  try {
    const { id, essayId } = await params;
    const essay = getEssay(essayId);
    if (!essay || essay.session_id !== id) {
      return NextResponse.json({ error: 'Essay not found' }, { status: 404 });
    }

    const body = await request.json();
    if (body.grading_status !== undefined) {
      updateEssayGrade(essayId, body.grading_status, body.overall_grade ?? undefined);
    }
    if (body.is_flagged !== undefined) {
      updateEssayFlag(essayId, Boolean(body.is_flagged));
    }
    if (body.topic_id !== undefined) {
      updateEssayTopic(essayId, body.topic_id, body.topic_manually_reassigned ?? false);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/essays/[essayId] PATCH]', err);
    return NextResponse.json({ error: 'Failed to update essay' }, { status: 500 });
  }
}

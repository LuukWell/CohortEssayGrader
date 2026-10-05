import { NextRequest, NextResponse } from 'next/server';
import { logAction } from '@/lib/db-helpers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, participantId, condition, essaySet, essayId, actionType, actionDetail } = body;

    if (!sessionId || !participantId || !condition || !essaySet || !actionType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    logAction(sessionId, participantId, condition, essaySet, actionType, essayId ?? undefined, actionDetail ?? undefined);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/logs]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

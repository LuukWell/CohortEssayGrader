import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const participantId = searchParams.get('participantId');

    if (!sessionId && !participantId) {
      return NextResponse.json({ error: 'sessionId or participantId required' }, { status: 400 });
    }

    const db = getDb();
    const logs = (
      sessionId
        ? db.prepare('SELECT * FROM action_logs WHERE session_id = ? ORDER BY timestamp').all(sessionId)
        : db.prepare('SELECT * FROM action_logs WHERE participant_id = ? ORDER BY timestamp').all(participantId!)
    ) as Record<string, unknown>[];

    const headers = logs.length > 0
      ? Object.keys(logs[0])
      : ['id', 'session_id', 'participant_id', 'condition', 'essay_set', 'essay_id', 'action_type', 'action_detail', 'timestamp'];

    const rows = logs.map((row) => headers.map((h) => escapeCSV(row[h])).join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    const label = participantId ?? sessionId;
    const date = new Date().toISOString().split('T')[0];

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="action_logs_${label}_${date}.csv"`,
      },
    });
  } catch (err) {
    console.error('[api/export GET]', err);
    return NextResponse.json({ error: 'Failed to export logs' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await params;
    const db = getDb();

    const rows = db.prepare(`
      SELECT action_detail, timestamp
      FROM action_logs
      WHERE session_id = ? AND action_type = 'quality_rank_updated'
      ORDER BY timestamp ASC
    `).all(sessionId) as { action_detail: string; timestamp: string }[];

    const parsed = rows.map(row => {
      let ranks: { essayId: string; avgAiScore: number | null; rank: number }[] = [];
      try { ranks = JSON.parse(row.action_detail); } catch { /* skip malformed */ }
      return { timestamp: row.timestamp, ranks };
    });

    // Skip precompute build-up snapshots (where some essays still have null
    // avgAiScore). Only "complete" snapshots — every essay scored — represent
    // meaningful ranking state. Then collapse consecutive identical-rank
    // snapshots so the table shows actual movement, not redundant logs.
    const completeSnapshots = parsed.filter(s => s.ranks.length > 0 && s.ranks.every(r => r.avgAiScore !== null));

    const snapshots: typeof completeSnapshots = [];
    for (const snap of completeSnapshots) {
      const prev = snapshots[snapshots.length - 1];
      const sameAsPrev = prev && prev.ranks.length === snap.ranks.length
        && prev.ranks.every((r, i) => r.essayId === snap.ranks[i].essayId && r.rank === snap.ranks[i].rank);
      if (!sameAsPrev) snapshots.push(snap);
    }

    const essayRows = db.prepare(
      'SELECT id, filename FROM essays WHERE session_id = ?'
    ).all(sessionId) as { id: string; filename: string }[];
    const essayNames: Record<string, string> = {};
    for (const e of essayRows) essayNames[e.id] = e.filename;

    const sessionRow = db.prepare('SELECT created_at FROM sessions WHERE id = ?').get(sessionId) as { created_at: string } | undefined;
    const sessionStart = sessionRow?.created_at ?? null;

    return NextResponse.json({ snapshots, essayNames, sessionStart });
  } catch (err) {
    console.error('[api/rank-history GET]', err);
    return NextResponse.json({ error: 'Failed to fetch rank history' }, { status: 500 });
  }
}

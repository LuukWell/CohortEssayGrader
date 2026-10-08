import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface ActionLogRow {
  id: number;
  session_id: string;
  participant_id: string;
  condition: string;
  essay_set: string;
  essay_id: string | null;
  action_type: string;
  action_detail: string | null;
  timestamp: string;
}

function computeTimingMetrics(logs: ActionLogRow[]) {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  /* Total session time */
  const startLog = sorted.find((l) => l.action_type === 'session_start');
  const endLog = [...sorted].reverse().find((l) => l.action_type === 'session_end');
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const sessionStartMs = startLog
    ? new Date(startLog.timestamp).getTime()
    : first ? new Date(first.timestamp).getTime() : null;
  const sessionEndMs = endLog
    ? new Date(endLog.timestamp).getTime()
    : last ? new Date(last.timestamp).getTime() : null;
  const total_session_seconds =
    sessionStartMs != null && sessionEndMs != null
      ? Math.round((sessionEndMs - sessionStartMs) / 1000)
      : null;

  /* Per-essay time: essay_opened until all_grades_submitted or essay_closed */
  const essayWindows: Record<string, { opened_ms?: number; completed_ms?: number; filename?: string }> = {};
  for (const log of sorted) {
    if (!log.essay_id) continue;
    if (!essayWindows[log.essay_id]) essayWindows[log.essay_id] = {};
    if (log.action_type === 'essay_opened') {
      essayWindows[log.essay_id].opened_ms = new Date(log.timestamp).getTime();
    }
    if (log.action_type === 'all_grades_submitted' || log.action_type === 'essay_closed') {
      essayWindows[log.essay_id].completed_ms = new Date(log.timestamp).getTime();
    }
  }
  const per_essay = Object.entries(essayWindows).map(([essay_id, w]) => ({
    essay_id,
    time_seconds: w.opened_ms != null && w.completed_ms != null
      ? Math.round((w.completed_ms - w.opened_ms) / 1000)
      : null,
  }));

  /* Dashboard time: dashboard_viewed until the next non-dashboard action */
  const dashboardNavActions = new Set(['topic_selected', 'essay_sort_changed', 'essay_flagged', 'essay_unflagged', 'help_tooltip_opened']);
  let dashboard_time_seconds = 0;
  let lastDashboardMs: number | null = null;
  for (const log of sorted) {
    if (log.action_type === 'dashboard_viewed') {
      lastDashboardMs = new Date(log.timestamp).getTime();
    } else if (lastDashboardMs != null && !dashboardNavActions.has(log.action_type)) {
      dashboard_time_seconds += Math.round((new Date(log.timestamp).getTime() - lastDashboardMs) / 1000);
      lastDashboardMs = null;
    }
  }

  /* Comparison time: benchmark_comparison_opened until benchmark_comparison_closed */
  let comparison_time_seconds = 0;
  let lastComparisonMs: number | null = null;
  const comparison_events: { opened_at: string; closed_at: string; duration_seconds: number }[] = [];
  for (const log of sorted) {
    if (log.action_type === 'benchmark_comparison_opened') {
      lastComparisonMs = new Date(log.timestamp).getTime();
    } else if (log.action_type === 'benchmark_comparison_closed' && lastComparisonMs != null) {
      const dur = Math.round((new Date(log.timestamp).getTime() - lastComparisonMs) / 1000);
      comparison_time_seconds += dur;
      comparison_events.push({
        opened_at: new Date(lastComparisonMs).toISOString(),
        closed_at: log.timestamp,
        duration_seconds: dur,
      });
      lastComparisonMs = null;
    }
  }

  return {
    total_session_seconds,
    dashboard_time_seconds: dashboard_time_seconds || null,
    comparison_time_seconds: comparison_time_seconds || null,
    comparison_events,
    per_essay,
  };
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

    let sessionIds: string[];
    if (sessionId) {
      sessionIds = [sessionId];
    } else {
      const rows = db
        .prepare('SELECT id FROM sessions WHERE participant_id = ?')
        .all(participantId!) as { id: string }[];
      sessionIds = rows.map((r) => r.id);
    }

    if (sessionIds.length === 0) {
      return NextResponse.json({ error: 'No sessions found' }, { status: 404 });
    }

    const ph = sessionIds.map(() => '?').join(',');

    const sessions = db
      .prepare(
        `SELECT id, participant_id, condition, essay_set, processing_status, created_at, completed_at
         FROM sessions WHERE id IN (${ph})`,
      )
      .all(...sessionIds);

    const essays = db
      .prepare(
        `SELECT id, session_id, filename, word_count, grading_status, overall_grade, summary, topic_id, is_flagged
         FROM essays WHERE session_id IN (${ph}) ORDER BY session_id, filename`,
      )
      .all(...sessionIds);

    const grades = db
      .prepare(
        `SELECT session_id, essay_id, criterion_name, criterion_id,
                teacher_score, ai_score, original_ai_score,
                teacher_justification, ai_justification, graded_at
         FROM grades WHERE session_id IN (${ph}) ORDER BY session_id, essay_id, criterion_name`,
      )
      .all(...sessionIds);

    const benchmarks = db
      .prepare(`SELECT session_id, criterion_name, essay_id, benchmark_type, score, set_at FROM benchmarks WHERE session_id IN (${ph})`)
      .all(...sessionIds);

    const similarities = db
      .prepare(
        `SELECT session_id, essay_id_a, essay_id_b, similarity_score
         FROM essay_similarities WHERE session_id IN (${ph})
         ORDER BY session_id, essay_id_a, similarity_score DESC`,
      )
      .all(...sessionIds);

    const actionLogs = db
      .prepare(`SELECT * FROM action_logs WHERE session_id IN (${ph}) ORDER BY session_id, timestamp`)
      .all(...sessionIds) as ActionLogRow[];

    /* Parse action_detail JSON where possible */
    const parsedLogs = actionLogs.map((l) => ({
      ...l,
      action_detail: l.action_detail
        ? (() => { try { return JSON.parse(l.action_detail); } catch { return l.action_detail; } })()
        : null,
    }));

    /* Compute timing per session */
    const timing_metrics: Record<string, ReturnType<typeof computeTimingMetrics>> = {};
    for (const sid of sessionIds) {
      timing_metrics[sid] = computeTimingMetrics(actionLogs.filter((l) => l.session_id === sid));
    }

    const exportData = {
      export_date: new Date().toISOString(),
      sessions,
      essays,
      grades,
      benchmarks,
      essay_similarities: similarities,
      action_logs: parsedLogs,
      timing_metrics,
    };

    const filename = `export_${participantId ?? sessionId}_${new Date().toISOString().split('T')[0]}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[api/export/all GET]', err);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}

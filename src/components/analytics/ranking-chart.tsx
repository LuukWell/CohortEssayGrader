'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface RankSnapshot {
  timestamp: string;
  ranks: { essayId: string; avgAiScore: number | null; rank: number }[];
}

interface RankHistoryData {
  snapshots: RankSnapshot[];
  essayNames: Record<string, string>;
  sessionStart: string | null;
}

type SortKey = 'name' | 'start' | 'now' | 'delta' | 'moves';
type SortDir = 'asc' | 'desc';

interface MovementRow {
  essayId: string;
  name: string;
  startRank: number | null;
  currentRank: number | null;
  delta: number | null;
  moves: number;
}

function buildRows(data: RankHistoryData): MovementRow[] {
  const { snapshots, essayNames } = data;
  // Collect every essayId that appears in any snapshot
  const allIds = new Set<string>();
  for (const s of snapshots) for (const r of s.ranks) allIds.add(r.essayId);

  const rows: MovementRow[] = [];
  for (const essayId of allIds) {
    let startRank: number | null = null;
    let currentRank: number | null = null;
    let lastSeen: number | null = null;
    let moves = 0;

    for (const snap of snapshots) {
      const entry = snap.ranks.find((r) => r.essayId === essayId);
      if (!entry) continue;
      if (startRank === null) startRank = entry.rank;
      currentRank = entry.rank;
      if (lastSeen !== null && lastSeen !== entry.rank) moves++;
      lastSeen = entry.rank;
    }

    const delta = startRank !== null && currentRank !== null ? startRank - currentRank : null;
    rows.push({
      essayId,
      name: essayNames[essayId] ?? essayId,
      startRank,
      currentRank,
      delta,
      moves,
    });
  }
  return rows;
}

export default function RankingChart({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<RankHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('now');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sessions/${sessionId}/rank-history`)
      .then((r) => r.json())
      .then((d: RankHistoryData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId]);

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);

  const sortedRows = useMemo(() => {
    const sign = sortDir === 'asc' ? 1 : -1;
    const cmpNum = (a: number | null, b: number | null) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a - b) * sign;
    };
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'name':  return a.name.localeCompare(b.name) * sign;
        case 'start': return cmpNum(a.startRank, b.startRank);
        case 'now':   return cmpNum(a.currentRank, b.currentRank);
        case 'delta': return cmpNum(a.delta, b.delta);
        case 'moves': return ((a.moves) - (b.moves)) * sign;
      }
    });
  }, [rows, sortKey, sortDir]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'var(--muted)' }}>
        <span className="text-sm">Loading ranking history…</span>
      </div>
    );
  }

  if (!data || data.snapshots.length < 1 || rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl py-20 text-center"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <TrendingUp className="mb-4 h-12 w-12" style={{ color: 'var(--muted)' }} />
        <p className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
          No ranking history yet.
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Rank snapshots are recorded as AI scores are assigned during grading.
        </p>
      </div>
    );
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      // Numeric: lower rank number = better, so asc shows top movers first by default
      setSortDir(k === 'name' ? 'asc' : k === 'delta' ? 'desc' : 'asc');
    }
  }

  const Header = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'center' | 'right' }) => {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-sm font-semibold uppercase tracking-wider transition-colors hover:text-[color:var(--foreground)]"
        style={{
          color: active ? '#6366F1' : 'var(--muted)',
          textAlign: align,
        }}
        title={`Sort by ${label}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
        </span>
      </th>
    );
  };

  function DeltaCell({ delta }: { delta: number | null }) {
    if (delta === null) {
      return <span style={{ color: 'var(--muted)' }}>—</span>;
    }
    if (delta === 0) {
      return (
        <span className="inline-flex items-center gap-1 font-mono" style={{ color: 'var(--muted)' }}>
          <Minus className="h-3.5 w-3.5" />0
        </span>
      );
    }
    const up = delta > 0;
    return (
      <span className="inline-flex items-center gap-1 font-mono font-semibold"
        style={{ color: up ? '#10B981' : '#EF4444' }}>
        {up ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
        {up ? '+' : ''}{delta}
      </span>
    );
  }

  return (
    <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
      <div className="flex items-center gap-2 border-b px-6 py-4" style={{ borderColor: 'var(--card-border)' }}>
        <TrendingUp className="h-5 w-5" style={{ color: '#6366F1' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Quality Ranking Movement</h2>
        <span className="text-sm" style={{ color: 'var(--muted)' }}>
          ({data.snapshots.length} snapshot{data.snapshots.length === 1 ? '' : 's'} · rank 1 = highest AI quality)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--card-border)' }}>
              <Header k="name"  label="Essay" />
              <Header k="start" label="Start" align="center" />
              <Header k="now"   label="Now"   align="center" />
              <Header k="delta" label="Δ"     align="center" />
              <Header k="moves" label="Moves" align="center" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr key={row.essayId} className="border-b transition-colors hover:bg-[color:var(--background)]"
                style={{
                  borderColor: 'var(--card-border)',
                  background: i % 2 === 1 ? 'var(--background)' : 'transparent',
                }}>
                <td className="px-4 py-3 font-mono text-sm font-semibold" style={{ color: '#6366F1' }}>
                  {row.name}
                </td>
                <td className="px-4 py-3 text-center font-mono text-sm" style={{ color: 'var(--foreground)' }}>
                  {row.startRank ?? '—'}
                </td>
                <td className="px-4 py-3 text-center font-mono text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  {row.currentRank ?? '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <DeltaCell delta={row.delta} />
                </td>
                <td className="px-4 py-3 text-center font-mono text-sm" style={{ color: row.moves > 0 ? 'var(--foreground)' : 'var(--muted)' }}>
                  {row.moves}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t px-6 py-3 text-xs" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
        Δ = start rank − current rank (positive means moved up, negative means moved down).
        Moves = number of times this essay&apos;s rank changed across snapshots.
      </div>
    </div>
  );
}

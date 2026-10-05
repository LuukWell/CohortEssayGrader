import { NextRequest, NextResponse } from 'next/server';
import { getBenchmarks, setBenchmark, removeBenchmark } from '@/lib/db-helpers';
import { getDb } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const criterion = request.nextUrl.searchParams.get('criterion');
    if (!criterion) {
      return NextResponse.json({ error: 'criterion query param required' }, { status: 400 });
    }

    const benchmarks = getBenchmarks(id, criterion);
    const db = getDb();

    const enriched = benchmarks.map((b) => {
      const essay = db
        .prepare('SELECT filename, summary FROM essays WHERE id = ?')
        .get(b.essay_id) as { filename: string; summary: string | null } | null;
      return { ...b, filename: essay?.filename ?? null, summary: essay?.summary ?? null };
    });

    return NextResponse.json({ benchmarks: enriched });
  } catch (err) {
    console.error('[api/benchmarks GET]', err);
    return NextResponse.json({ error: 'Failed to fetch benchmarks' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { criterionName, essayId, type, score } = await request.json();

    if (!criterionName || !essayId || !type) {
      return NextResponse.json({ error: 'criterionName, essayId, and type required' }, { status: 400 });
    }

    setBenchmark(id, criterionName, essayId, String(type), score ?? 0, {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/benchmarks POST]', err);
    return NextResponse.json({ error: 'Failed to set benchmark' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { criterionName, type } = await request.json();

    if (!criterionName || !type) {
      return NextResponse.json({ error: 'criterionName and type required' }, { status: 400 });
    }

    removeBenchmark(id, criterionName, String(type));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/benchmarks DELETE]', err);
    return NextResponse.json({ error: 'Failed to remove benchmark' }, { status: 500 });
  }
}

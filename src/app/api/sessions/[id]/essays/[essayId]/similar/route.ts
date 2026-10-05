import { NextRequest, NextResponse } from 'next/server';
import { getSimilarEssays } from '@/lib/db-helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; essayId: string }> },
) {
  try {
    const { id, essayId } = await params;
    const similar = getSimilarEssays(id, essayId, 5);
    return NextResponse.json({ similar });
  } catch (err) {
    console.error('[api/similar]', err);
    return NextResponse.json({ error: 'Failed to fetch similar essays' }, { status: 500 });
  }
}

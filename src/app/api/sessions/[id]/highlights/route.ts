import { NextRequest, NextResponse } from 'next/server';
import {
  createTeacherHighlight,
  deleteTeacherHighlight,
  getTeacherHighlights,
  getTeacherHighlightsBySession,
} from '@/lib/db-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await params;
    const essayId = request.nextUrl.searchParams.get('essayId');
    const highlights = essayId
      ? getTeacherHighlights(sessionId, essayId)
      : getTeacherHighlightsBySession(sessionId);
    return NextResponse.json({ highlights });
  } catch (err) {
    console.error('GET /api/sessions/[id]/highlights error:', err);
    return NextResponse.json({ error: 'Failed to fetch teacher highlights' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const { essayId, criterionName, startIndex, endIndex, text } = body as {
      essayId: string;
      criterionName: string;
      startIndex: number;
      endIndex: number;
      text: string;
    };
    if (!essayId || !criterionName || typeof startIndex !== 'number' || typeof endIndex !== 'number' || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (endIndex <= startIndex || startIndex < 0) {
      return NextResponse.json({ error: 'Invalid highlight range' }, { status: 400 });
    }
    const highlightId = createTeacherHighlight(sessionId, essayId, criterionName, startIndex, endIndex, text);
    return NextResponse.json({ id: highlightId });
  } catch (err) {
    console.error('POST /api/sessions/[id]/highlights error:', err);
    return NextResponse.json({ error: 'Failed to create teacher highlight' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await params;
    const highlightIdRaw = request.nextUrl.searchParams.get('id');
    const highlightId = highlightIdRaw ? parseInt(highlightIdRaw, 10) : NaN;
    if (!Number.isFinite(highlightId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const removed = deleteTeacherHighlight(sessionId, highlightId);
    if (!removed) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    console.error('DELETE /api/sessions/[id]/highlights error:', err);
    return NextResponse.json({ error: 'Failed to delete teacher highlight' }, { status: 500 });
  }
}

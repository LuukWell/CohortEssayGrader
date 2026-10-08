import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCachedTopicKs } from '@/lib/db-helpers';
import { TOPIC_EMBED_MODEL, TOPIC_LLM_MODEL } from '@/lib/topic-model';
import { isEssaySet } from '@/lib/essay-loader';

// GET ?set=C: the k values that already have cached BGE + Gemma topics for this set
export async function GET(request: NextRequest) {
  const essaySet = new URL(request.url).searchParams.get('set');
  if (!isEssaySet(essaySet)) {
    return NextResponse.json({ error: 'unknown essay set' }, { status: 400 });
  }
  return NextResponse.json({
    set: essaySet,
    cachedK: getCachedTopicKs(essaySet, TOPIC_EMBED_MODEL, TOPIC_LLM_MODEL),
    embedModel: TOPIC_EMBED_MODEL,
    llmModel: TOPIC_LLM_MODEL,
  });
}

// DELETE ?set=C: clear the cached topics for that set (all k), or everything if no set is given
export async function DELETE(request: NextRequest) {
  const essaySet = new URL(request.url).searchParams.get('set');
  const db = getDb();

  if (essaySet) {
    if (!isEssaySet(essaySet)) {
      return NextResponse.json({ error: 'unknown essay set' }, { status: 400 });
    }
    const result = db.prepare('DELETE FROM topic_model_cache WHERE essay_set = ?').run(essaySet);
    return NextResponse.json({ deleted: result.changes, set: essaySet });
  }

  const result = db.prepare('DELETE FROM topic_model_cache').run();
  return NextResponse.json({ deleted: result.changes });
}

import { NextResponse } from 'next/server';
import { listEssaySets } from '@/lib/essay-loader';
import { precomputedTopicSets } from '@/lib/precomputed-topics';

// GET: the essay sets in data/ (one per subset_<NAME>.csv) and which of them
// have pre-computed research topics.
export async function GET() {
  return NextResponse.json({
    sets: listEssaySets(),
    precomputedTopicSets: precomputedTopicSets(),
  });
}

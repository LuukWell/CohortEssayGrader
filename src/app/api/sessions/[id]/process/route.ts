import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  getEssaysBySession,
  updateSessionStatus,
  updateEssaySummary,
  updateEssayTopic,
  createTopic,
  getTopicsBySession,
  setSimilarity,
  getCachedEssay,
  setCachedSummary,
  setCachedEmbedding,
} from '@/lib/db-helpers';
import { generateEssaySummary, generateEmbeddingServer } from '@/lib/ollama-server';
import { getOrComputeTopicModel, DEFAULT_TOPIC_K } from '@/lib/topic-model';
import { loadPrecomputedTopics } from '@/lib/precomputed-topics';
import { cosineSimilarity } from '@/lib/similarity';

// Track sessions with a pipeline actively running in this process
const activePipelines = new Set<string>();

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = getSession(id);

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Only block if already fully complete or actively running right now
  if (session.processing_status === 'complete') {
    return NextResponse.json({ status: 'complete' });
  }
  if (activePipelines.has(id)) {
    return NextResponse.json({ status: session.processing_status });
  }

  updateSessionStatus(id, 'processing');
  activePipelines.add(id);

  runPipeline(id, session.essay_set)
    .catch((err) => {
      console.error('Processing pipeline failed:', err);
      updateSessionStatus(id, 'error');
    })
    .finally(() => activePipelines.delete(id));

  return NextResponse.json({ status: 'processing' }, { status: 202 });
}

/* ------------------------------------------------------------------ */
/*  Pipeline                                                            */
/* ------------------------------------------------------------------ */

async function runPipeline(sessionId: string, essaySet: string): Promise<void> {
  const session = getSession(sessionId)!;
  const essays = getEssaysBySession(sessionId);

  // Step A — Summaries (use cache keyed by TSV row ID from filename "essay-{id}")
  updateSessionStatus(sessionId, 'summarising');

  for (const essay of essays) {
    const tsvId = essay.filename.replace(/^essay-/, '');
    const cached = getCachedEssay(tsvId);

    let summary: string;
    if (cached?.summary) {
      summary = cached.summary;
    } else {
      summary = await generateEssaySummary(essay.pdf_content);
      setCachedSummary(tsvId, summary);
    }
    updateEssaySummary(essay.id, summary);
  }

  // Step B — Topics
  updateSessionStatus(sessionId, 'topics');
  const existingTopics = getTopicsBySession(sessionId);
  console.log(`[topics] essays=${essays.length}, existingTopics=${existingTopics.length}`);

  if (existingTopics.length === 0) {
    // Helper: given topics + tsv_id-keyed assignments, create DB rows and assign essays
    const applyTopics = (
      topics: { label: string; keywords: string[] }[],
      assignmentsByTsvId: Record<string, number>,
    ) => {
      const topicIdMap: Record<number, number> = {};
      for (let i = 0; i < topics.length; i++) {
        topicIdMap[i] = createTopic(sessionId, i, topics[i].keywords, topics[i].label);
      }

      let assignedCount = 0;
      let missedCount = 0;
      for (const essay of essays) {
        const tsvId = essay.filename.replace(/^essay-/, '');
        const topicIndex = assignmentsByTsvId[tsvId];
        if (topicIndex !== undefined && topicIdMap[topicIndex] !== undefined) {
          updateEssayTopic(essay.id, topicIdMap[topicIndex], false);
          assignedCount++;
        } else {
          missedCount++;
        }
      }
      console.log(`[topics] Assigned ${assignedCount}/${essays.length}. Missed (left NULL): ${missedCount}.`);
    };

    const k = session.precomputed_k ?? DEFAULT_TOPIC_K;
    const precomputed = session.use_precomputed_topics ? loadPrecomputedTopics(essaySet, k) : null;

    if (precomputed && precomputed.topics.length > 0) {
      console.log(`[topics] Using pre-computed CSV topics for set "${essaySet}" k=${k}`);
      applyTopics(precomputed.topics, precomputed.assignments);
    } else {
      if (precomputed) {
        console.warn(`[topics] No pre-computed CSV rows for set "${essaySet}" k=${k} — using BGE + Gemma instead`);
      }
      // BGE + Gemma: computed on the first run for this set/k, then served from topic_model_cache
      const { topics, assignments, source } = await getOrComputeTopicModel(
        essaySet,
        k,
        essays.map((e) => ({ tsvId: e.filename.replace(/^essay-/, ''), text: e.pdf_content })),
      );
      console.log(`[topics] BGE + Gemma ${source === 'cache' ? 'cache hit' : 'computed'} for set "${essaySet}" k=${k} — ${topics.length} topic(s)`);
      applyTopics(topics, assignments);
    }
  } else {
    // Topics already exist from a previous run.
    // Assign any stragglers to the most-populated existing topic.
    // Do NOT re-run topic modelling — new indices would be incompatible with existing DB rows.
    const unassigned = essays.filter((e) => e.topic_id == null);
    if (unassigned.length > 0) {
      const topicCounts: Record<number, number> = {};
      for (const t of existingTopics) topicCounts[t.id] = 0;
      for (const e of essays) {
        if (e.topic_id != null && topicCounts[e.topic_id] !== undefined)
          topicCounts[e.topic_id]++;
      }
      const mostPopularTopicId = existingTopics.reduce(
        (best, t) => (topicCounts[t.id] > topicCounts[best] ? t.id : best),
        existingTopics[0].id,
      );
      for (const essay of unassigned) {
        updateEssayTopic(essay.id, mostPopularTopicId, false);
      }
      console.log(`[topics] Existing topics found. Assigned ${unassigned.length} straggler(s) to topic id=${mostPopularTopicId}.`);
    } else {
      console.log('[topics] Existing topics found, all essays already assigned.');
    }
  }

  // Step C — Embeddings + pairwise similarities (use cache keyed by TSV row ID)
  updateSessionStatus(sessionId, 'similarities');
  const embeddings: { id: string; vec: number[] }[] = [];

  for (const essay of essays) {
    const tsvId = essay.filename.replace(/^essay-/, '');
    const cached = getCachedEssay(tsvId);

    let vec: number[];
    if (cached?.embedding_json) {
      vec = JSON.parse(cached.embedding_json) as number[];
    } else {
      vec = await generateEmbeddingServer(essay.pdf_content);
      setCachedEmbedding(tsvId, JSON.stringify(vec));
    }
    embeddings.push({ id: essay.id, vec });
  }

  // Compute all pairs, store top-5 per essay
  const TOP_K = 5;
  for (let i = 0; i < embeddings.length; i++) {
    const scores: { id: string; score: number }[] = [];
    for (let j = 0; j < embeddings.length; j++) {
      if (i === j) continue;
      scores.push({
        id: embeddings[j].id,
        score: cosineSimilarity(embeddings[i].vec, embeddings[j].vec),
      });
    }
    scores.sort((a, b) => b.score - a.score);
    for (const { id: otherId, score } of scores.slice(0, TOP_K)) {
      setSimilarity(sessionId, embeddings[i].id, otherId, score);
    }
  }

  updateSessionStatus(sessionId, 'complete');
}

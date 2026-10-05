import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import {
  getSession,
  getEssaysBySession,
  upsertGrade,
  getGradeForCriterion,
  getCachedAssessment,
  setCachedAssessment,
  updateEssayAiQuality,
  computeQualityRanks,
  logAction,
} from '@/lib/db-helpers';
import { getDb } from '@/lib/db';
import { gradeCriterion } from '@/lib/llm-grading';
import { RUBRIC_CRITERIA } from '@/lib/llm-config';

// Sentinel written to ai_assessment_cache when an LLM call fails or times out.
// Future sessions see the row, treat it as a hit, and skip the LLM rather than
// retrying the same hanging call. To force a retry, delete the row manually:
//   DELETE FROM ai_assessment_cache WHERE ai_justification = '[PRECOMPUTE_FAILED]';
const PRECOMPUTE_FAILED_SENTINEL = '[PRECOMPUTE_FAILED]';
// Per-criterion LLM timeout. Overridable via env so users on slower hardware
// (CPU-offloaded models, larger models) can give the model more headroom
// without rebuilding. Default 180s — enough for ~7-8B models on a 4GB GPU
// with partial CPU offload.
const LLM_TIMEOUT_MS = Number(process.env.LLM_PRECOMPUTE_TIMEOUT_MS) || 180_000;

const activeSessions = new Set<string>();

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (!session.precompute_grades) {
    return NextResponse.json({ status: 'skipped', reason: 'precompute_grades is off' });
  }
  if (session.grades_precomputed) {
    return NextResponse.json({ status: 'already_done' });
  }
  if (activeSessions.has(sessionId)) {
    return NextResponse.json({ status: 'running' }, { status: 202 });
  }

  activeSessions.add(sessionId);
  runPrecompute(sessionId, session).finally(() => activeSessions.delete(sessionId));

  return NextResponse.json({ status: 'started' }, { status: 202 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    grades_precomputed: session.grades_precomputed === 1,
    running: activeSessions.has(sessionId),
  });
}

async function runPrecompute(
  sessionId: string,
  session: Awaited<ReturnType<typeof getSession>> & {},
): Promise<void> {
  try {
    const essays = getEssaysBySession(sessionId);
    // Use the same hardcoded criteria the grading workspace uses (RUBRIC_CRITERIA from llm-config).
    // session.rubric_criteria_json is unused by the grading flow, so we mirror that source here.
    const criteria = RUBRIC_CRITERIA;
    if (!essays.length || !criteria.length) {
      console.error('[precompute] No essays or criteria — nothing to precompute');
      return;
    }

    const assessmentType = session.assessment_type || 'flow';
    const assessmentLength = session.assessment_length || 'medium';
    const useCached = session.use_cached_assessments === 1;
    const rubricHash = createHash('sha256').update(session.rubric_content).digest('hex');

    const total = essays.length * criteria.length;
    let done = 0;

    for (const essay of essays) {
      const tsvId = essay.filename.replace(/^essay-/, '');

      for (const criterion of criteria) {
        // Skip if already graded (precomputed or manually)
        const existing = getGradeForCriterion(sessionId, essay.id, criterion.name);
        if (existing?.ai_score !== null && existing?.ai_score !== undefined) {
          done++;
          continue;
        }

        let aiScore: number | null = null;
        let aiJustification: string | null = null;
        let evidenceJson: string | null = null;

        // Try cache first if enabled
        if (useCached) {
          const cached = getCachedAssessment(tsvId, criterion.id, rubricHash, assessmentType, assessmentLength);
          if (cached) {
            // Negative-cache sentinel: this pair previously failed/timed out — skip retry.
            if (cached.ai_justification === PRECOMPUTE_FAILED_SENTINEL) {
              console.warn(`[precompute] Skipping (cached failure) essay=${essay.filename} criterion=${criterion.name}`);
              done++;
              continue;
            }
            aiScore = cached.ai_score;
            aiJustification = cached.ai_justification;
            evidenceJson = cached.evidence_json;
          }
        }

        // Cache miss or caching disabled — call LLM (with a hard timeout so one
        // hung call can't stall the entire batch).
        if (aiScore === null && aiJustification === null) {
          try {
            const result = await Promise.race([
              gradeCriterion({
                essayContent: essay.pdf_content,
                criterion,
                assessmentType,
                assessmentLength,
                contextList: [],
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('LLM_TIMEOUT')), LLM_TIMEOUT_MS),
              ),
            ]);

            aiScore = result.score;
            const justText = Array.isArray(result.justification)
              ? result.justification.join('\n')
              : result.justification;
            aiJustification = justText;
            evidenceJson = JSON.stringify(result.evidence ?? []);

            // If the LLM returned no usable score, treat as a failure: write the
            // negative-cache sentinel and skip persisting a polluting null grade.
            if (aiScore === null) {
              console.warn(`[precompute] LLM returned null score for essay=${essay.filename} criterion=${criterion.name} — negative-caching`);
              setCachedAssessment(tsvId, criterion.id, rubricHash, assessmentType, assessmentLength, {
                ai_score: null,
                ai_justification: PRECOMPUTE_FAILED_SENTINEL,
                evidence_json: null,
              });
              done++;
              continue;
            }

            setCachedAssessment(tsvId, criterion.id, rubricHash, assessmentType, assessmentLength, {
              ai_score: aiScore,
              ai_justification: aiJustification,
              evidence_json: evidenceJson,
            });
          } catch (err) {
            console.error(`[precompute] Failed essay=${essay.filename} criterion=${criterion.name}:`, err);
            // Write negative-cache sentinel so subsequent sessions skip this pair
            // instead of re-triggering the same hang/error.
            setCachedAssessment(tsvId, criterion.id, rubricHash, assessmentType, assessmentLength, {
              ai_score: null,
              ai_justification: PRECOMPUTE_FAILED_SENTINEL,
              evidence_json: null,
            });
            done++;
            continue;
          }
        }

        // Persist to grades table
        upsertGrade(sessionId, essay.id, criterion.name, criterion.id, {
          ai_score: aiScore,
          original_ai_score: aiScore,
          ai_justification: aiJustification,
          evidence_json: evidenceJson,
        });

        updateEssayAiQuality(essay.id, sessionId);
        done++;
      }

      // Log rank snapshot after all criteria for this essay
      const ranks = computeQualityRanks(sessionId);
      logAction(sessionId, session.participant_id, session.condition, session.essay_set,
        'quality_rank_updated', undefined, ranks);
    }

    // Mark complete
    const db = getDb();
    db.prepare('UPDATE sessions SET grades_precomputed = 1 WHERE id = ?').run(sessionId);
    console.log(`[precompute] Done: ${done}/${total} grades for session ${sessionId}`);
  } catch (err) {
    console.error('[precompute] Pipeline error:', err);
  }
}

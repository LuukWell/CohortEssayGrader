// BGE + Gemma topic modelling (scripts/topic_bge_gemma.py), cached per set.

import { spawn } from 'child_process';
import path from 'path';
import { getCachedTopicModel, setCachedTopicModel, type TopicModelCache } from './db-helpers';

export const TOPIC_EMBED_MODEL = process.env.TOPIC_EMBED_MODEL || 'BAAI/bge-large-en-v1.5';
export const TOPIC_LLM_MODEL = process.env.TOPIC_LLM_MODEL || 'gemma2:9b';
export const DEFAULT_TOPIC_K = 5;

const PYTHON_BIN = process.env.TOPIC_PYTHON || 'python';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
// First run downloads the BGE weights (~1.3 GB) and loads gemma2:9b, so allow plenty of time.
const TIMEOUT_MS = Number(process.env.TOPIC_MODEL_TIMEOUT_MS) || 15 * 60_000;
const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'topic_bge_gemma.py');

// Concurrent sessions for the same set/k share one Python run instead of racing.
const inFlight = new Map<string, Promise<TopicModelCache>>();

/**
 * Returns BGE + Gemma topics for an essay set, computing them on the first call and
 * serving them from topic_model_cache afterwards. Assignments are keyed by tsv_id.
 */
export async function getOrComputeTopicModel(
  essaySet: string,
  k: number,
  essays: { tsvId: string; text: string }[],
): Promise<TopicModelCache & { source: 'cache' | 'computed' }> {
  const cached = getCachedTopicModel(essaySet, k, TOPIC_EMBED_MODEL, TOPIC_LLM_MODEL);
  if (cached) return { ...cached, source: 'cache' };

  const key = `${essaySet}|${k}|${TOPIC_EMBED_MODEL}|${TOPIC_LLM_MODEL}`;
  let job = inFlight.get(key);
  if (!job) {
    job = runPython(essaySet, k, essays)
      .then((result) => {
        setCachedTopicModel(essaySet, k, TOPIC_EMBED_MODEL, TOPIC_LLM_MODEL, result);
        return result;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return { ...(await job), source: 'computed' };
}

function runPython(
  essaySet: string,
  k: number,
  essays: { tsvId: string; text: string }[],
): Promise<TopicModelCache> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      PYTHON_BIN,
      [SCRIPT_PATH, '--embed-model', TOPIC_EMBED_MODEL, '--llm-model', TOPIC_LLM_MODEL, '--ollama-url', OLLAMA_BASE_URL],
      { env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' } },
    );

    let stdout = '';
    let lastError = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`topic model timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
    proc.stderr.on('data', (d: Buffer) => {
      for (const line of d.toString('utf-8').split('\n')) {
        if (!line.trim()) continue;
        console.log('[topics:py]', line);
        if (line.includes('FAILED')) lastError = line;
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`could not start "${PYTHON_BIN}": ${err.message}`));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(lastError || `topic model exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as TopicModelCache;
        resolve({ topics: parsed.topics, assignments: parsed.assignments });
      } catch {
        reject(new Error(`topic model returned invalid JSON: ${stdout.slice(0, 200)}`));
      }
    });

    proc.stdin.end(JSON.stringify({
      essay_set: essaySet,
      k,
      essays: essays.map((e) => ({ id: e.tsvId, text: e.text })),
    }));
  });
}

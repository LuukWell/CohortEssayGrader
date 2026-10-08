// Optional research topic assignments (BGE + gemma2:9b, computed offline).
// The file is not required: without it the "Use pre-computed topics" option is hidden and
// topics are always computed live (see topic-model.ts).

import fs from 'fs';
import path from 'path';

const ASSIGNMENTS_CSV = path.join(process.cwd(), 'data', 'essay_topic_assignments_cd.csv');
const VARIANT_PREFIX = 'BAAI/bge-large-en-v1.5+gemma2:9b|k=';

interface Row { variant: string; subset: string; essayId: string; topicId: number; topicLabel: string }

function readRows(): Row[] {
  if (!fs.existsSync(ASSIGNMENTS_CSV)) return [];
  const [, ...lines] = fs.readFileSync(ASSIGNMENTS_CSV, 'utf-8').trim().split(/\r?\n/);
  // method,variant,subset,essay_id,topic_id,topic_label (label is last, may contain commas)
  return lines.map((l) => {
    const parts = l.split(',');
    return {
      variant: parts[1],
      subset: parts[2],
      essayId: parts[3],
      topicId: parseInt(parts[4], 10),
      topicLabel: parts.slice(5).join(',').trim(),
    };
  });
}

/** Essay sets that have pre-computed topics for at least one k. */
export function precomputedTopicSets(): string[] {
  const sets = new Set(readRows().filter((r) => r.variant?.startsWith(VARIANT_PREFIX)).map((r) => r.subset));
  return [...sets].sort();
}

/** Topics and tsv_id -> topic index for one set/k; empty when the file or the rows are missing. */
export function loadPrecomputedTopics(essaySet: string, k: number): {
  topics: { label: string; keywords: string[] }[];
  assignments: Record<string, number>;
} {
  const variant = `${VARIANT_PREFIX}${k}`;
  const rows = readRows().filter((r) => r.variant === variant && r.subset === essaySet);

  // Pick most-common label per topic_id
  const labelCounts: Record<number, Record<string, number>> = {};
  const assignments: Record<string, number> = {};
  for (const r of rows) {
    if (!labelCounts[r.topicId]) labelCounts[r.topicId] = {};
    labelCounts[r.topicId][r.topicLabel] = (labelCounts[r.topicId][r.topicLabel] ?? 0) + 1;
    assignments[r.essayId] = r.topicId;
  }

  const topicIds = Object.keys(labelCounts).map(Number).sort((a, b) => a - b);
  const topics = topicIds.map((tid) => {
    const label = Object.entries(labelCounts[tid]).sort((a, b) => b[1] - a[1])[0][0];
    return { label, keywords: label.toLowerCase().split(/\s+/).filter((w) => w.length > 3) };
  });

  console.log(`[precomputed-topics] Loaded ${topics.length} topics for set ${essaySet} (variant: ${variant})`);
  return { topics, assignments };
}

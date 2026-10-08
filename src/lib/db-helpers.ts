import { getDb } from './db';

export interface Session {
  id: string;
  participant_id: string;
  condition: 'baseline' | 'dashboard';
  /** Name of the data/subset_<NAME>.csv file the essays came from */
  essay_set: string;
  use_precomputed_topics: number;
  /** Topic count k, for both the research CSV and the live BGE + Gemma model. */
  precomputed_k: number | null;
  precompute_grades: number;
  grades_precomputed: number;
  use_cached_assessments: number;
  assessment_type: string;
  assessment_length: string;
  teacher_name: string | null;
  rubric_content: string;
  rubric_criteria_json: string | null;
  topic_method: string | null;
  processing_status: string;
  created_at: string;
  completed_at: string | null;
}

export interface Essay {
  id: string;
  session_id: string;
  filename: string;
  pdf_path: string;
  essay_prompt: string | null;
  pdf_content: string;
  summary: string | null;
  word_count: number | null;
  topic_id: number | null;
  topic_manually_reassigned: number;
  is_flagged: number;
  grading_status: string;
  overall_grade: number | null;
  avg_ai_score: number | null;
  created_at: string;
}

export interface Topic {
  id: number;
  session_id: string;
  topic_index: number;
  keywords: string;
  label: string | null;
}

export interface SimilarEssay {
  essay_id: string;
  filename: string;
  similarity_score: number;
  grading_status: string;
  overall_grade: number | null;
  summary: string | null;
}

export interface Grade {
  id: number;
  session_id: string;
  essay_id: string;
  criterion_name: string;
  criterion_id: number;
  teacher_score: number | null;
  ai_score: number | null;
  original_ai_score: number | null;
  teacher_justification: string | null;
  ai_justification: string | null;
  evidence_json: string | null;
  graded_at: string;
}

export interface TeacherHighlight {
  id: number;
  session_id: string;
  essay_id: string;
  criterion_name: string;
  start_index: number;
  end_index: number;
  text: string;
  created_at: string;
}

export interface Benchmark {
  id: number;
  session_id: string;
  criterion_name: string;
  essay_id: string;
  benchmark_type: string; // score value as string, e.g. "3"
  score: number;
  teacher_justification: string | null;
  ai_justification: string | null;
  set_at: string;
}

export interface SessionStats {
  totalEssays: number;
  gradedEssays: number;
  avgGrade: number | null;
  gradeDistribution: Record<number, number>;
}

// Session

export function createSession(
  participantId: string,
  condition: 'baseline' | 'dashboard',
  essaySet: string,
  rubricContent: string,
  usePrecomputedTopics = false,
  precomputedK: number | null = null,
  precomputeGrades = true,
  useCachedAssessments = false,
  assessmentType = 'flow',
  assessmentLength = 'medium',
): string {
  const db = getDb();
  const { v4: uuidv4 } = require('uuid');
  const id: string = uuidv4();
  db.prepare(`
    INSERT INTO sessions (id, participant_id, condition, essay_set, rubric_content, use_precomputed_topics, precomputed_k, precompute_grades, use_cached_assessments, assessment_type, assessment_length)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, participantId, condition, essaySet, rubricContent, usePrecomputedTopics ? 1 : 0, precomputedK, precomputeGrades ? 1 : 0, useCachedAssessments ? 1 : 0, assessmentType, assessmentLength);
  return id;
}

export function getSession(sessionId: string): Session | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session) ?? null;
}

export function updateSessionStatus(sessionId: string, status: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET processing_status = ? WHERE id = ?').run(status, sessionId);
}

export function completeSession(sessionId: string): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
}

export function findResumableSession(
  participantId: string,
  condition: 'baseline' | 'dashboard',
  essaySet: string,
): Session | null {
  const db = getDb();
  return (db.prepare(
    `SELECT * FROM sessions
     WHERE participant_id = ? AND condition = ? AND essay_set = ? AND completed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`
  ).get(participantId, condition, essaySet) as Session) ?? null;
}

// Essays

export function createEssay(
  sessionId: string,
  filename: string,
  pdfPath: string,
  pdfContent: string,
  wordCount: number,
  essayPrompt?: string | null,
): string {
  const db = getDb();
  const { v4: uuidv4 } = require('uuid');
  const id: string = uuidv4();
  db.prepare(`
    INSERT INTO essays (id, session_id, filename, pdf_path, pdf_content, word_count, essay_prompt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, filename, pdfPath, pdfContent, wordCount, essayPrompt ?? null);
  return id;
}

export function getEssaysBySession(sessionId: string): Essay[] {
  const db = getDb();
  return db.prepare('SELECT * FROM essays WHERE session_id = ? ORDER BY filename').all(sessionId) as Essay[];
}

export function getEssay(essayId: string): Essay | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM essays WHERE id = ?').get(essayId) as Essay) ?? null;
}

export function updateEssayTopic(essayId: string, topicId: number, manual: boolean): void {
  const db = getDb();
  db.prepare('UPDATE essays SET topic_id = ?, topic_manually_reassigned = ? WHERE id = ?')
    .run(topicId, manual ? 1 : 0, essayId);
}

export function updateEssayFlag(essayId: string, flagged: boolean): void {
  const db = getDb();
  db.prepare('UPDATE essays SET is_flagged = ? WHERE id = ?').run(flagged ? 1 : 0, essayId);
}

export function updateEssayGrade(essayId: string, status: string, overallGrade?: number): void {
  const db = getDb();
  db.prepare('UPDATE essays SET grading_status = ?, overall_grade = ? WHERE id = ?')
    .run(status, overallGrade ?? null, essayId);
}

export function updateEssaySummary(essayId: string, summary: string): void {
  const db = getDb();
  db.prepare('UPDATE essays SET summary = ? WHERE id = ?').run(summary, essayId);
}

// Topics

export function createTopic(
  sessionId: string,
  topicIndex: number,
  keywords: string[],
  label: string,
): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO topics (session_id, topic_index, keywords, label) VALUES (?, ?, ?, ?)
  `).run(sessionId, topicIndex, JSON.stringify(keywords), label);
  return result.lastInsertRowid as number;
}

export function getTopicsBySession(sessionId: string): Topic[] {
  const db = getDb();
  return db.prepare('SELECT * FROM topics WHERE session_id = ? ORDER BY topic_index').all(sessionId) as Topic[];
}

// Similarities

export function setSimilarity(
  sessionId: string,
  essayIdA: string,
  essayIdB: string,
  score: number,
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO essay_similarities (session_id, essay_id_a, essay_id_b, similarity_score)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, essayIdA, essayIdB, score);
}

export function getSimilarEssays(sessionId: string, essayId: string, limit = 5): SimilarEssay[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      es.essay_id_b AS essay_id,
      e.filename,
      es.similarity_score,
      e.grading_status,
      e.overall_grade,
      e.summary
    FROM essay_similarities es
    JOIN essays e ON e.id = es.essay_id_b
    WHERE es.session_id = ? AND es.essay_id_a = ?
    ORDER BY es.similarity_score DESC
    LIMIT ?
  `).all(sessionId, essayId, limit) as SimilarEssay[];
}

// Grades

export function upsertGrade(
  sessionId: string,
  essayId: string,
  criterionName: string,
  criterionId: number,
  data: {
    teacher_score?: number | null;
    ai_score?: number | null;
    original_ai_score?: number | null;
    teacher_justification?: string | null;
    ai_justification?: string | null;
    evidence_json?: string | null;
  },
): void {
  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM grades WHERE session_id = ? AND essay_id = ? AND criterion_name = ?'
  ).get(sessionId, essayId, criterionName);

  if (existing) {
    const sets = Object.keys(data)
      .filter(k => data[k as keyof typeof data] !== undefined)
      .map(k => `${k} = ?`)
      .join(', ');
    const values = Object.values(data).filter(v => v !== undefined);
    db.prepare(`UPDATE grades SET ${sets}, graded_at = CURRENT_TIMESTAMP WHERE session_id = ? AND essay_id = ? AND criterion_name = ?`)
      .run(...values, sessionId, essayId, criterionName);
  } else {
    db.prepare(`
      INSERT INTO grades (session_id, essay_id, criterion_name, criterion_id, teacher_score, ai_score, original_ai_score, teacher_justification, ai_justification, evidence_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId, essayId, criterionName, criterionId,
      data.teacher_score ?? null,
      data.ai_score ?? null,
      data.original_ai_score ?? null,
      data.teacher_justification ?? null,
      data.ai_justification ?? null,
      data.evidence_json ?? null,
    );
  }
}

export function getGrades(sessionId: string, essayId: string): Grade[] {
  const db = getDb();
  return db.prepare('SELECT * FROM grades WHERE session_id = ? AND essay_id = ?').all(sessionId, essayId) as Grade[];
}

export function getGradeForCriterion(sessionId: string, essayId: string, criterionName: string): Grade | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM grades WHERE session_id = ? AND essay_id = ? AND criterion_name = ?')
    .get(sessionId, essayId, criterionName) as Grade) ?? null;
}

// Benchmarks

export function setBenchmark(
  sessionId: string,
  criterionName: string,
  essayId: string,
  type: string,
  score: number,
  justifications: { teacher?: string | null; ai?: string | null },
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO benchmarks (session_id, criterion_name, essay_id, benchmark_type, score, teacher_justification, ai_justification)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, criterion_name, benchmark_type) DO UPDATE SET
      essay_id = excluded.essay_id,
      score = excluded.score,
      teacher_justification = excluded.teacher_justification,
      ai_justification = excluded.ai_justification,
      set_at = CURRENT_TIMESTAMP
  `).run(sessionId, criterionName, essayId, type, score, justifications.teacher ?? null, justifications.ai ?? null);
}

export function getBenchmarks(sessionId: string, criterionName: string): Benchmark[] {
  const db = getDb();
  return db.prepare('SELECT * FROM benchmarks WHERE session_id = ? AND criterion_name = ?')
    .all(sessionId, criterionName) as Benchmark[];
}

export function removeBenchmark(sessionId: string, criterionName: string, type: string): void {
  const db = getDb();
  db.prepare('DELETE FROM benchmarks WHERE session_id = ? AND criterion_name = ? AND benchmark_type = ?')
    .run(sessionId, criterionName, type);
}

// Teacher highlights

export function createTeacherHighlight(
  sessionId: string,
  essayId: string,
  criterionName: string,
  startIndex: number,
  endIndex: number,
  text: string,
): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO teacher_highlights (session_id, essay_id, criterion_name, start_index, end_index, text)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, essayId, criterionName, startIndex, endIndex, text);
  return result.lastInsertRowid as number;
}

export function getTeacherHighlights(sessionId: string, essayId: string): TeacherHighlight[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM teacher_highlights WHERE session_id = ? AND essay_id = ? ORDER BY start_index ASC'
  ).all(sessionId, essayId) as TeacherHighlight[];
}

export function getTeacherHighlightsBySession(sessionId: string): TeacherHighlight[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM teacher_highlights WHERE session_id = ? ORDER BY essay_id, start_index ASC'
  ).all(sessionId) as TeacherHighlight[];
}

export function deleteTeacherHighlight(sessionId: string, highlightId: number): TeacherHighlight | null {
  const db = getDb();
  const existing = db.prepare(
    'SELECT * FROM teacher_highlights WHERE id = ? AND session_id = ?'
  ).get(highlightId, sessionId) as TeacherHighlight | undefined;
  if (!existing) return null;
  db.prepare('DELETE FROM teacher_highlights WHERE id = ? AND session_id = ?').run(highlightId, sessionId);
  return existing;
}

// Logging

export function logAction(
  sessionId: string,
  participantId: string,
  condition: string,
  essaySet: string,
  actionType: string,
  essayId?: string,
  detail?: unknown,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO action_logs (session_id, participant_id, condition, essay_set, essay_id, action_type, action_detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId, participantId, condition, essaySet,
    essayId ?? null,
    actionType,
    detail ? JSON.stringify(detail) : null,
  );
}

// AI Quality Score

export function updateEssayAiQuality(essayId: string, sessionId: string): void {
  const db = getDb();
  const grades = db.prepare(
    'SELECT ai_score FROM grades WHERE session_id = ? AND essay_id = ? AND ai_score IS NOT NULL'
  ).all(sessionId, essayId) as { ai_score: number }[];
  const avg = grades.length > 0
    ? grades.reduce((sum, g) => sum + g.ai_score, 0) / grades.length
    : null;
  db.prepare('UPDATE essays SET avg_ai_score = ? WHERE id = ?').run(avg, essayId);
}

export interface QualityRank {
  essayId: string;
  avgAiScore: number | null;
  rank: number;
}

export function computeQualityRanks(sessionId: string): QualityRank[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, avg_ai_score FROM essays WHERE session_id = ? ORDER BY avg_ai_score DESC NULLS LAST'
  ).all(sessionId) as { id: string; avg_ai_score: number | null }[];

  const result: QualityRank[] = [];
  let rank = 1;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i].avg_ai_score !== rows[i - 1].avg_ai_score) {
      rank = i + 1;
    }
    result.push({ essayId: rows[i].id, avgAiScore: rows[i].avg_ai_score, rank });
  }
  return result;
}

// AI Assessment Cache

export interface CachedAssessment {
  ai_score: number | null;
  ai_justification: string | null;
  evidence_json: string | null;
}

export function getCachedAssessment(
  tsvId: string,
  criterionId: number,
  rubricHash: string,
  assessmentType: string,
  assessmentLength: string,
): CachedAssessment | null {
  const db = getDb();
  return (db.prepare(
    'SELECT ai_score, ai_justification, evidence_json FROM ai_assessment_cache WHERE tsv_id = ? AND criterion_id = ? AND rubric_hash = ? AND assessment_type = ? AND assessment_length = ?'
  ).get(tsvId, criterionId, rubricHash, assessmentType, assessmentLength) as CachedAssessment) ?? null;
}

export function setCachedAssessment(
  tsvId: string,
  criterionId: number,
  rubricHash: string,
  assessmentType: string,
  assessmentLength: string,
  data: CachedAssessment,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO ai_assessment_cache (tsv_id, criterion_id, rubric_hash, assessment_type, assessment_length, ai_score, ai_justification, evidence_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tsv_id, criterion_id, rubric_hash, assessment_type, assessment_length) DO UPDATE SET
      ai_score = excluded.ai_score,
      ai_justification = excluded.ai_justification,
      evidence_json = excluded.evidence_json,
      cached_at = CURRENT_TIMESTAMP
  `).run(tsvId, criterionId, rubricHash, assessmentType, assessmentLength, data.ai_score, data.ai_justification, data.evidence_json);
}

// Summary / embedding cache

export interface SummaryCache {
  tsv_id: string;
  summary: string;
  embedding_json: string | null;
}

export function getCachedEssay(tsvId: string): SummaryCache | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM essay_summary_cache WHERE tsv_id = ?').get(tsvId) as SummaryCache) ?? null;
}

export function setCachedSummary(tsvId: string, summary: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO essay_summary_cache (tsv_id, summary)
    VALUES (?, ?)
    ON CONFLICT(tsv_id) DO UPDATE SET summary = excluded.summary
  `).run(tsvId, summary);
}

export function setCachedEmbedding(tsvId: string, embeddingJson: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO essay_summary_cache (tsv_id, summary, embedding_json)
    VALUES (?, '', ?)
    ON CONFLICT(tsv_id) DO UPDATE SET embedding_json = excluded.embedding_json
  `).run(tsvId, embeddingJson);
}

// Topic model cache (per essay set, k and models)

export interface TopicModelCache {
  topics: { label: string; keywords: string[] }[];
  /** tsv_id -> topic_index */
  assignments: Record<string, number>;
}

export function getCachedTopicModel(
  essaySet: string,
  k: number,
  embedModel: string,
  llmModel: string,
): TopicModelCache | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT topics_json, assignments_json FROM topic_model_cache WHERE essay_set = ? AND k = ? AND embed_model = ? AND llm_model = ?'
  ).get(essaySet, k, embedModel, llmModel) as { topics_json: string; assignments_json: string } | undefined;
  if (!row) return null;
  return {
    topics: JSON.parse(row.topics_json),
    assignments: JSON.parse(row.assignments_json),
  };
}

export function setCachedTopicModel(
  essaySet: string,
  k: number,
  embedModel: string,
  llmModel: string,
  data: TopicModelCache,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO topic_model_cache (essay_set, k, embed_model, llm_model, topics_json, assignments_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(essay_set, k, embed_model, llm_model) DO UPDATE SET
      topics_json = excluded.topics_json,
      assignments_json = excluded.assignments_json,
      created_at = CURRENT_TIMESTAMP
  `).run(essaySet, k, embedModel, llmModel, JSON.stringify(data.topics), JSON.stringify(data.assignments));
}

/** k values that already have a cached topic model for this set + model pair. */
export function getCachedTopicKs(essaySet: string, embedModel: string, llmModel: string): number[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT k FROM topic_model_cache WHERE essay_set = ? AND embed_model = ? AND llm_model = ? ORDER BY k'
  ).all(essaySet, embedModel, llmModel) as { k: number }[];
  return rows.map((r) => r.k);
}

// Stats

export function getSessionStats(sessionId: string): SessionStats {
  const db = getDb();

  const { totalEssays } = db.prepare(
    'SELECT COUNT(*) as totalEssays FROM essays WHERE session_id = ?'
  ).get(sessionId) as { totalEssays: number };

  const { gradedEssays } = db.prepare(
    "SELECT COUNT(*) as gradedEssays FROM essays WHERE session_id = ? AND grading_status = 'graded'"
  ).get(sessionId) as { gradedEssays: number };

  const { avgGrade } = db.prepare(
    'SELECT AVG(overall_grade) as avgGrade FROM essays WHERE session_id = ? AND overall_grade IS NOT NULL'
  ).get(sessionId) as { avgGrade: number | null };

  // Buckets are on the displayed /10 scale (overall_grade is stored on /5).
  const rows = db.prepare(
    'SELECT ROUND(overall_grade * 2) as bucket, COUNT(*) as cnt FROM essays WHERE session_id = ? AND overall_grade IS NOT NULL GROUP BY bucket'
  ).all(sessionId) as { bucket: number; cnt: number }[];

  const gradeDistribution: Record<number, number> = {};
  for (const row of rows) gradeDistribution[row.bucket] = row.cnt;

  return { totalEssays, gradedEssays, avgGrade, gradeDistribution };
}

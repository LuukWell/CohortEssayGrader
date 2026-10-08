import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'grading.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  // Migrate benchmarks table: replace 'low'/'high' CHECK constraint with open TEXT
  const bInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='benchmarks'"
  ).get() as { sql: string } | null;
  if (bInfo?.sql?.includes("'low', 'high'")) {
    db.exec('DROP TABLE IF EXISTS benchmarks');
  }

  // Widen sessions table: allow essay_set C/D and add use_precomputed_topics column
  const sessInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'"
  ).get() as { sql: string } | null;
  if (sessInfo?.sql?.includes("essay_set IN ('A', 'B')")) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE sessions_new (
        id TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL,
        condition TEXT NOT NULL CHECK(condition IN ('baseline', 'dashboard')),
        essay_set TEXT NOT NULL,
        teacher_name TEXT,
        rubric_content TEXT NOT NULL,
        rubric_criteria_json TEXT,
        topic_method TEXT,
        use_precomputed_topics INTEGER NOT NULL DEFAULT 0,
        precomputed_k INTEGER,
        processing_status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );
      INSERT INTO sessions_new
        SELECT id, participant_id, condition, essay_set, teacher_name,
               rubric_content, rubric_criteria_json, topic_method, 0, NULL,
               processing_status, created_at, completed_at
        FROM sessions;
      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
    `);
    db.pragma('foreign_keys = ON');
  } else if (sessInfo) {
    // Already widened, just add any missing columns
    const sessCols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    if (!sessCols.some((c) => c.name === 'use_precomputed_topics')) {
      db.exec('ALTER TABLE sessions ADD COLUMN use_precomputed_topics INTEGER NOT NULL DEFAULT 0');
    }
    if (!sessCols.some((c) => c.name === 'precomputed_k')) {
      db.exec('ALTER TABLE sessions ADD COLUMN precomputed_k INTEGER');
    }
    if (!sessCols.some((c) => c.name === 'precompute_grades')) {
      db.exec('ALTER TABLE sessions ADD COLUMN precompute_grades INTEGER NOT NULL DEFAULT 1');
    }
    if (!sessCols.some((c) => c.name === 'grades_precomputed')) {
      db.exec('ALTER TABLE sessions ADD COLUMN grades_precomputed INTEGER NOT NULL DEFAULT 0');
    }
    if (!sessCols.some((c) => c.name === 'use_cached_assessments')) {
      db.exec('ALTER TABLE sessions ADD COLUMN use_cached_assessments INTEGER NOT NULL DEFAULT 0');
    }
    if (!sessCols.some((c) => c.name === 'assessment_type')) {
      db.exec("ALTER TABLE sessions ADD COLUMN assessment_type TEXT NOT NULL DEFAULT 'flow'");
    }
    if (!sessCols.some((c) => c.name === 'assessment_length')) {
      db.exec("ALTER TABLE sessions ADD COLUMN assessment_length TEXT NOT NULL DEFAULT 'medium'");
    }
  }

  // Add missing essay columns
  const essayCols = db.prepare("PRAGMA table_info(essays)").all() as { name: string }[];
  if (essayCols.length > 0 && !essayCols.some((c) => c.name === 'essay_prompt')) {
    db.exec('ALTER TABLE essays ADD COLUMN essay_prompt TEXT');
  }
  if (essayCols.length > 0 && !essayCols.some((c) => c.name === 'avg_ai_score')) {
    db.exec('ALTER TABLE essays ADD COLUMN avg_ai_score REAL');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      condition TEXT NOT NULL CHECK(condition IN ('baseline', 'dashboard')),
      essay_set TEXT NOT NULL,
      teacher_name TEXT,
      rubric_content TEXT NOT NULL,
      rubric_criteria_json TEXT,
      topic_method TEXT,
      use_precomputed_topics INTEGER NOT NULL DEFAULT 0,
      precomputed_k INTEGER,
      precompute_grades INTEGER NOT NULL DEFAULT 1,
      grades_precomputed INTEGER NOT NULL DEFAULT 0,
      use_cached_assessments INTEGER NOT NULL DEFAULT 0,
      assessment_type TEXT NOT NULL DEFAULT 'flow',
      assessment_length TEXT NOT NULL DEFAULT 'medium',
      processing_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS essays (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      filename TEXT NOT NULL,
      pdf_path TEXT NOT NULL,
      essay_prompt TEXT,
      pdf_content TEXT NOT NULL,
      summary TEXT,
      word_count INTEGER,
      topic_id INTEGER,
      topic_manually_reassigned INTEGER DEFAULT 0,
      is_flagged INTEGER DEFAULT 0,
      grading_status TEXT DEFAULT 'pending',
      overall_grade REAL,
      avg_ai_score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      topic_index INTEGER NOT NULL,
      keywords TEXT NOT NULL,
      label TEXT
    );

    CREATE TABLE IF NOT EXISTS essay_similarities (
      session_id TEXT NOT NULL,
      essay_id_a TEXT NOT NULL,
      essay_id_b TEXT NOT NULL,
      similarity_score REAL NOT NULL,
      PRIMARY KEY (session_id, essay_id_a, essay_id_b)
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      essay_id TEXT NOT NULL,
      criterion_name TEXT NOT NULL,
      criterion_id INTEGER NOT NULL,
      teacher_score INTEGER,
      ai_score INTEGER,
      original_ai_score INTEGER,
      teacher_justification TEXT,
      ai_justification TEXT,
      evidence_json TEXT,
      graded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS benchmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      criterion_name TEXT NOT NULL,
      essay_id TEXT NOT NULL,
      benchmark_type TEXT NOT NULL,
      score INTEGER NOT NULL,
      teacher_justification TEXT,
      ai_justification TEXT,
      set_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, criterion_name, benchmark_type)
    );

    CREATE TABLE IF NOT EXISTS action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      condition TEXT NOT NULL,
      essay_set TEXT NOT NULL,
      essay_id TEXT,
      action_type TEXT NOT NULL,
      action_detail TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS essay_summary_cache (
      tsv_id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      embedding_json TEXT
    );

    CREATE TABLE IF NOT EXISTS topic_model_cache (
      essay_set TEXT NOT NULL,
      k INTEGER NOT NULL,
      embed_model TEXT NOT NULL,
      llm_model TEXT NOT NULL,
      topics_json TEXT NOT NULL,
      assignments_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (essay_set, k, embed_model, llm_model)
    );

    CREATE TABLE IF NOT EXISTS ai_assessment_cache (
      tsv_id TEXT NOT NULL,
      criterion_id INTEGER NOT NULL,
      rubric_hash TEXT NOT NULL,
      assessment_type TEXT NOT NULL,
      assessment_length TEXT NOT NULL,
      ai_score INTEGER,
      ai_justification TEXT,
      evidence_json TEXT,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tsv_id, criterion_id, rubric_hash, assessment_type, assessment_length)
    );

    CREATE TABLE IF NOT EXISTS teacher_highlights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      essay_id TEXT NOT NULL,
      criterion_name TEXT NOT NULL,
      start_index INTEGER NOT NULL,
      end_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

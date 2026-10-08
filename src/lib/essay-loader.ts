import fs from 'fs';
import path from 'path';
import { createEssay } from './db-helpers';

const DATA_DIR = path.join(process.cwd(), 'data');
const RUBRIC_PATH = path.join(DATA_DIR, 'rubric', 'rubric.txt');

// An essay set is any data/subset_<NAME>.csv file; NAME is what the setup screen shows.
const SUBSET_FILE = /^subset_([A-Za-z0-9_-]+)\.csv$/;

export function listEssaySets(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .map((f) => SUBSET_FILE.exec(f)?.[1])
    .filter((s): s is string => !!s)
    .sort();
}

export function isEssaySet(essaySet: unknown): essaySet is string {
  return typeof essaySet === 'string' && listEssaySets().includes(essaySet);
}

/** RFC 4180 CSV: quoted fields may contain commas, newlines and doubled quotes (""). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row);
      row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

/**
 * Reads a subset CSV by header name. Required columns: id, essay.
 * Optional: prompt, word_count (computed when missing). Other columns are ignored.
 */
function parseCsvSubset(csvPath: string): { id: string; prompt: string; essay: string; word_count: number }[] {
  const [header, ...rows] = parseCsv(fs.readFileSync(csvPath, 'utf-8'));
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const idIdx = col('id');
  const essayIdx = col('essay');
  const promptIdx = col('prompt');
  const wordCountIdx = col('word_count');
  if (idIdx === -1 || essayIdx === -1) {
    throw new Error(`${path.basename(csvPath)} needs at least an "id" and an "essay" column`);
  }

  return rows
    .map((r) => {
      const essay = (r[essayIdx] ?? '').trim();
      const wordCount = parseInt(r[wordCountIdx] ?? '', 10) || essay.split(/\s+/).filter(Boolean).length;
      return {
        id: (r[idIdx] ?? '').trim(),
        prompt: promptIdx === -1 ? '' : (r[promptIdx] ?? '').trim(),
        essay,
        word_count: wordCount,
      };
    })
    .filter((r) => r.id && r.essay);
}

export async function loadEssaySet(sessionId: string, essaySet: string): Promise<string[]> {
  if (!isEssaySet(essaySet)) {
    throw new Error(`Unknown essay set "${essaySet}" — expected data/subset_${essaySet}.csv`);
  }
  const csvPath = path.join(DATA_DIR, `subset_${essaySet}.csv`);
  const essayIds: string[] = [];
  for (const row of parseCsvSubset(csvPath)) {
    essayIds.push(createEssay(sessionId, `essay-${row.id}`, csvPath, row.essay, row.word_count, row.prompt || null));
  }
  return essayIds;
}

export function getRubricContent(): string {
  if (!fs.existsSync(RUBRIC_PATH)) {
    throw new Error(`Rubric file not found at ${RUBRIC_PATH}`);
  }
  // Normalize CRLF to LF first. The rubric hash is part of the assessment cache key,
  // so a Windows checkout would otherwise never hit the cache.
  return fs.readFileSync(RUBRIC_PATH, 'utf-8').replace(/\r\n/g, '\n').trim();
}

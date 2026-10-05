import type { GradeRecord } from '@/types';

const CSV_HEADERS = [
  'timestamp',
  'teacher_name',
  'essay_id',
  'criterion_name',
  'criterion_id',
  'score_min',
  'score_max',
  'teacher_score',
  'ai_score',
  'revised_ai_score',
  'score_difference',
  'assessment_type',
  'assessment_length',
  'hallucination_threshold',
  'evidence_count',
  'time_spent_seconds',
  'hallucinations_detected',
  'hallucinations_confirmed',
  'hallucinations_reported',
  'action_type',
  'assessment_was_edited',
  'original_ai_score',
  'edited_justification_text',
  'avg_teacher_score_for_criterion',
] as const;

function escapeCSVField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export class CsvRecorder {
  private teacherName: string;
  private records: GradeRecord[];
  private sessionStart: string;

  constructor(teacherName: string) {
    this.teacherName = teacherName;
    this.records = [];
    this.sessionStart = new Date().toISOString();
    this.loadFromLocalStorage();
  }

  addGradeRecord(record: Omit<GradeRecord, 'timestamp' | 'teacher_name' | 'avg_teacher_score_for_criterion'>): void {
    const avg = this.computeAvgTeacherScore(record.criterion_name, record.teacher_score);
    const fullRecord: GradeRecord = {
      ...record,
      timestamp: new Date().toISOString(),
      teacher_name: this.teacherName,
      avg_teacher_score_for_criterion: avg,
    };
    this.records.push(fullRecord);
    this.saveToLocalStorage();
  }

  private computeAvgTeacherScore(criterionName: string, currentScore: number | null): number | null {
    const scores: number[] = [];
    for (const r of this.records) {
      if (r.criterion_name === criterionName && r.teacher_score !== null) {
        scores.push(r.teacher_score);
      }
    }
    if (currentScore !== null) scores.push(currentScore);
    if (scores.length === 0) return null;
    const sum = scores.reduce((a, b) => a + b, 0);
    return Math.round((sum / scores.length) * 100) / 100;
  }

  getCSVContent(): string {
    const headerLine = CSV_HEADERS.join(',');
    const dataLines = this.records.map((record) =>
      CSV_HEADERS.map((header) => escapeCSVField(record[header])).join(',')
    );
    return [headerLine, ...dataLines].join('\n');
  }

  downloadCSV(): void {
    const csvContent = this.getCSVContent();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    const sanitizedName = this.teacherName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `session_${sanitizedName}_${date}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  saveToLocalStorage(): void {
    if (typeof window === 'undefined') return;
    const key = 'essay_grader_csv_' + this.teacherName;
    try {
      const data = JSON.stringify({
        sessionStart: this.sessionStart,
        records: this.records,
      });
      localStorage.setItem(key, data);
    } catch {
      // localStorage may be full or unavailable
    }
  }

  loadFromLocalStorage(): void {
    if (typeof window === 'undefined') return;
    const key = 'essay_grader_csv_' + this.teacherName;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.records && Array.isArray(data.records)) {
          this.records = data.records;
        }
        if (data.sessionStart) {
          this.sessionStart = data.sessionStart;
        }
      }
    } catch {
      // Corrupted data - start fresh
      this.records = [];
    }
  }

  getRecords(): GradeRecord[] {
    return [...this.records];
  }

  getRecordCount(): number {
    return this.records.length;
  }
}

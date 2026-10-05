// Server-side only — shared grading logic used by both the /api/llm route and the precomputation pipeline.
import { callOllamaServer, cleanJsonObject } from '@/lib/ollama-server';

export const GRADING_SYSTEM_PROMPT = `You are a strict essay grader for a masters level course. Hold students to a high standard. If something is weak, say so plainly. If something is good, say so briefly. Do not use fancy language, filler words, or unnecessary adjectives. Write like you are talking to the student directly — short sentences, plain English.

GRADING METHODOLOGY:
1. Read the full essay before grading anything.
2. For each criterion, check the essay against EVERY score level in the rubric (low to high). Find the level that fits best.
3. Give the score of the closest matching level. If it falls between two levels, pick the nearer one — do not default to the middle.
4. In your justification, point to specific rubric levels and say why the essay fits or does not fit them.
5. Do NOT make the score obvious from your justification — the reader should not be able to guess the exact number.

AVOIDING SCORE BIAS — THIS IS MANDATORY:
Score 3 is NOT a safe default. Before committing to a score, apply this test:
- Does the essay clearly FAIL at this criterion with specific, observable evidence? → the score is 1 or 2.
- Does the essay clearly SUCCEED at this criterion with specific, observable evidence? → the score is 4 or 5.
- Only assign 3 if the essay has roughly equal, concrete evidence of both success AND failure — not because you are unsure.
Most essays deserve a 2 or a 4. Genuinely weak essays deserve a 1. Genuinely strong essays deserve a 5.
Do not hedge. Commit to the score the evidence supports.

WRITING STYLE:
- Use simple, direct English. No fancy words. No filler.
- Say "the essay does X" not "the essay demonstrates a commendable ability to X".
- Say "this is missing" not "there is a notable absence of".
- Keep sentences short. One idea per sentence.

EVIDENCE RULES:
- Every quote MUST be copied EXACTLY from the essay. Do not change any words, fix grammar, or rephrase.
- If you cannot find an exact quote, do not make one up.
- Pick quotes that are specific to this criterion, not generic lines that could apply to anything.

CRITICAL: You MUST respond with ONLY valid JSON. No markdown code fences. No explanation text. No preamble. Just the JSON.`;

export interface GradeResult {
  justification: string | string[];
  evidence: { quote: string; paragraph: string; relatedAssessmentIndexes?: number[] }[];
  score: number | null;
  error?: string;
}

export function safeParseJson<T>(raw: string): T {
  const cleaned = cleanJsonObject(raw);

  try { return JSON.parse(cleaned) as T; } catch { /* fall through */ }

  const fixed = cleaned.replace(
    /"((?:[^"\\]|\\.)*)"/g,
    (_, inner: string) => `"${inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`
  );
  try { return JSON.parse(fixed) as T; } catch { /* fall through */ }

  const noTrailing = fixed.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(noTrailing) as T;
}

export async function gradeCriterion(payload: {
  essayContent: string;
  criterion: { name: string; id: number; scoreRange: { min: number; max: number }; levels?: { score: number; description: string }[] };
  rubricContent?: string;
  assessmentType?: string;
  assessmentLength?: string;
  contextList?: { title: string; content: string }[];
}): Promise<GradeResult> {
  const assessmentType = payload.assessmentType || 'flow';
  const assessmentLength = payload.assessmentLength || 'long';

  let justificationInstruction = '';
  let justificationSchema = '';
  if (assessmentType === 'bullets') {
    justificationInstruction =
      'Present your justification as bullet points. Return the justification as a JSON array of strings, where each string is a bullet point.';
    justificationSchema = '"justification": ["bullet point 1", "bullet point 2", ...],';
  } else {
    justificationInstruction =
      'Present your justification as a coherent paragraph. Return the justification as a single string.';
    justificationSchema = '"justification": "Your detailed justification without revealing the exact score",';
  }

  let lengthInstruction = '';
  if (assessmentLength === 'short') {
    lengthInstruction = assessmentType === 'bullets'
      ? 'Keep it to 3-4 bullet points. Each bullet should be 1 sentence.'
      : 'Keep the justification to 2-3 sentences total.';
  } else if (assessmentLength === 'medium') {
    lengthInstruction = assessmentType === 'bullets'
      ? 'Use 4-6 bullet points. Each bullet should be 1-2 sentences.'
      : 'Write 4-6 sentences in one paragraph.';
  } else {
    lengthInstruction = assessmentType === 'bullets'
      ? 'Use 6-8 bullet points. Each bullet can be 1-2 sentences with specific examples.'
      : 'Write a detailed paragraph of 6-10 sentences with specific examples from the essay.';
  }

  let contextBlock = '';
  if (payload.contextList && payload.contextList.length > 0) {
    contextBlock = 'CONTEXT:\n' +
      payload.contextList.map((ctx) => `- ${ctx.title}: ${ctx.content}`).join('\n') + '\n\n';
  }

  const { criterion } = payload;
  const levels = criterion.levels ?? [];
  const getLevel = (score: number) => levels.find((l) => l.score === score)?.description ?? '';

  let scoreLevelsBlock = '';
  if (levels.length > 0) {
    scoreLevelsBlock = levels.map((l) => `  ${l.score} = ${l.description}`).join('\n');
  } else if (payload.rubricContent) {
    scoreLevelsBlock = payload.rubricContent;
  }

  const decisionBlock = levels.length >= 5
    ? `Decision process:
Clearly fails:
  → 1 if: ${getLevel(1)}
  → 2 if: ${getLevel(2)}
Clearly succeeds:
  → 4 if: ${getLevel(4)}
  → 5 only if: ${getLevel(5)}
Genuinely in between → 3 if: ${getLevel(3)}`
    : '';

  const prompt = `${contextBlock}You are grading ONLY the criterion: ${criterion.name}.

Score levels:
${scoreLevelsBlock}

Important scoring rule: Assign the highest score the essay CLEARLY supports. Do not default to 3. Most essays are clearly a 2 or a 4.

${decisionBlock}

Before finalizing the score, check:
- Why couldn't this essay score lower? (name the specific evidence)
- Why couldn't this essay score higher? (name what is missing or weak)
- Does your chosen score match the level description? (re-read the level description and confirm)

ESSAY:
${payload.essayContent}

Output requirements:
- Justification: ${justificationInstruction} ${lengthInstruction} Do not reveal or hint at the exact score. Do not mention any other grading criteria.
- Evidence: At least 3 VERBATIM quotes from different parts of the essay. Each must be an exact copy — every word, space, and punctuation must match. Include quotes showing both strengths and weaknesses.
- For each evidence quote, indicate which sentences or bullet points from your justification it supports. Return the indexes (starting from 0) as "relatedAssessmentIndexes" in each evidence object. If the justification is a paragraph, treat each sentence as a unit (split on periods). If it's a list, use each bullet as a unit.
- Score: a single integer (${criterion.scoreRange.min}–${criterion.scoreRange.max}).

CRITICAL: Respond with ONLY this JSON object and nothing else:
{
  ${justificationSchema}
  "evidence": [
    {
      "quote": "EXACT verbatim text from essay",
      "paragraph": "Section/Paragraph identifier",
      "relatedAssessmentIndexes": [0, 1]
    }
  ],
  "score": number
}`;

  const raw = await callOllamaServer(GRADING_SYSTEM_PROMPT, prompt, { temperature: 0.3, num_predict: 1500 });

  if (!raw) {
    return {
      justification: 'The AI returned an empty response. Please try again.',
      evidence: [],
      score: null,
      error: 'EMPTY_RESPONSE',
    };
  }

  return safeParseJson<GradeResult>(raw);
}

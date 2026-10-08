import { NextRequest, NextResponse } from 'next/server';
import { callOllamaServer, generateEmbeddingServer } from '@/lib/ollama-server';
import { GRADING_SYSTEM_PROMPT, safeParseJson, gradeCriterion } from '@/lib/llm-grading';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, payload } = body;

    switch (action) {
      case 'extractRubricCriteria':
        return handleExtractRubric(payload);
      case 'gradeSingleCriterion':
        return handleGradeCriterion(payload);
      case 'generateOverallAssessment':
        return handleOverallAssessment(payload);
      case 'reviseCriterionScore':
        return handleReviseScore(payload);
      case 'generateEmbedding':
        return handleGenerateEmbedding(payload);
      case 'extractTopics':
        return handleExtractTopics(payload);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('LLM API route error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const isOllamaDown = message.includes('fetch failed') || message.includes('ECONNREFUSED');
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    return NextResponse.json(
      { error: isOllamaDown ? `Cannot connect to Ollama at ${baseUrl}` : message },
      { status: 500 }
    );
  }
}

// Extract Rubric
async function handleExtractRubric(payload: { rubricContent: string }) {
  const prompt = `If the provided text is not a grading rubric, or you are not confident you can extract meaningful criteria, respond with the string: NO_VALID_RUBRIC (no JSON, no explanation).

Analyze the following grading rubric and extract each criterion.
For each criterion, identify:
1. The name/title of the criterion
2. The possible score range (e.g., 1-5)
3. The description for each score level

RUBRIC:
${payload.rubricContent}

FORMAT YOUR RESPONSE AS A VALID JSON ARRAY with objects containing:
{
  "id": number,
  "name": "criterion name",
  "scoreRange": { "min": number, "max": number },
  "levels": [
    { "score": number, "description": "description for this score level" },
    ...
  ]
}

CRITICAL: You MUST respond with ONLY valid JSON. No markdown code fences. No explanation text. No preamble. Just the JSON array.`;

  const raw = await callOllamaServer(GRADING_SYSTEM_PROMPT, prompt, { temperature: 0.1, num_predict: 2048 });

  if (raw.toUpperCase().includes('NO_VALID_RUBRIC')) {
    return NextResponse.json({ result: 'NO_VALID_RUBRIC' });
  }

  const parsed = safeParseJson(raw);
  return NextResponse.json({ result: parsed });
}

// Grade Single Criterion
async function handleGradeCriterion(payload: {
  essayContent: string;
  criterion: { name: string; id: number; scoreRange: { min: number; max: number }; levels?: { score: number; description: string }[] };
  rubricContent?: string;
  assessmentType?: string;
  assessmentLength?: string;
  contextList?: { title: string; content: string }[];
}) {
  const result = await gradeCriterion(payload);
  return NextResponse.json({ result });
}

// Overall Assessment
async function handleOverallAssessment(payload: {
  essayContent: string;
  criteriaWithScores: { name: string; teacherScore?: number | null; aiScore?: number | null; scoreRange: { max: number } }[];
  contextList?: { title: string; content: string }[];
}) {
  const criteriaText = payload.criteriaWithScores
    .map((c) => `${c.name}: Score ${c.teacherScore ?? c.aiScore} out of ${c.scoreRange.max}`)
    .join('\n');

  let contextBlock = '';
  if (payload.contextList && payload.contextList.length > 0) {
    contextBlock = 'CONTEXT:\n' +
      payload.contextList.map((ctx) => `- ${ctx.title}: ${ctx.content}`).join('\n') + '\n\n';
  }

  const prompt = `${contextBlock}Given the following essay and the scores for each criterion, provide an overall assessment.
Summarize the essay's strengths and areas for improvement.
Generate a final grade on a 0-10 scale (with decimals allowed), where individual criterion scores are on their own scales (typically 1-5).

ESSAY:
${payload.essayContent}

CRITERIA & SCORES:
${criteriaText}

CRITICAL: Respond with ONLY this JSON object and nothing else:
{
  "strengths": "paragraph summarising strengths",
  "improvements": "paragraph summarising areas for improvement",
  "overallGrade": number,
  "advice": "brief actionable advice for the student"
}`;

  const raw = await callOllamaServer(GRADING_SYSTEM_PROMPT, prompt, { temperature: 0.3, num_predict: 1024 });
  const parsed = safeParseJson(raw);
  return NextResponse.json({ result: parsed });
}

// Revise Score
async function handleReviseScore(payload: {
  essayContent: string;
  criterion: { name: string; scoreRange: { min: number; max: number } };
  originalJustification: string;
  editedJustification: string;
  originalScore: number;
}) {
  const { criterion } = payload;

  const prompt = `The following essay was graded on criterion "${criterion.name}" (score range ${criterion.scoreRange.min}–${criterion.scoreRange.max}).
The original AI score was ${payload.originalScore}. A human reviewer has edited the justification.

If the edited justification implies a different score is warranted, revise accordingly. Otherwise keep the original score.

ESSAY (excerpt):
${payload.essayContent.slice(0, 3000)}

ORIGINAL JUSTIFICATION:
${payload.originalJustification}

EDITED JUSTIFICATION:
${payload.editedJustification}

CRITICAL: Respond with ONLY this JSON object and nothing else:
{
  "revisedScore": number,
  "rationale": "Brief explanation for your decision"
}`;

  const raw = await callOllamaServer(GRADING_SYSTEM_PROMPT, prompt, { temperature: 0.2, num_predict: 512 });
  const parsed = safeParseJson(raw);
  return NextResponse.json({ result: parsed });
}

// Embedding
async function handleGenerateEmbedding(payload: { text: string }) {
  const embedding = await generateEmbeddingServer(payload.text.slice(0, 8000));
  return NextResponse.json({ result: { embedding } });
}

// Topic Extraction
async function handleExtractTopics(payload: {
  essaySummaries: { id: string; summary: string }[];
}) {
  const { essaySummaries } = payload;

  const prompt = `You are analyzing a batch of ${essaySummaries.length} academic essays.
Based on the following essay summaries, identify 3-7 distinct topics that group these essays.

Essays:
${essaySummaries.map((e) => `[${e.id}] ${e.summary}`).join('\n')}

CRITICAL: Respond with ONLY this JSON object and nothing else:
{
  "topics": [
    {"label": "Short Topic Name", "keywords": ["keyword1", "keyword2", "keyword3", "keyword4"]}
  ],
  "assignments": {"essay_id": 0}
}
Where assignments maps each essay ID to its topic index (0-based).`;

  const raw = await callOllamaServer(
    'You are an academic text analysis assistant. You MUST respond with ONLY valid JSON. No markdown. No explanation.',
    prompt,
    { temperature: 0.3, num_predict: 4096 }
  );

  const parsed = safeParseJson(raw);
  return NextResponse.json({ result: parsed });
}

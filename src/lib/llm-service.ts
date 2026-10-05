import type {
  Criterion,
  ContextItem,
  AssessmentType,
  AssessmentLength,
  OverallAssessmentResult,
} from '@/types';

interface GradeSingleCriterionOptions {
  assessmentType?: AssessmentType;
  assessmentLength?: AssessmentLength;
  [key: string]: unknown;
}

interface CriterionWithScore {
  name: string;
  teacherScore?: number | null;
  aiScore?: number | null;
  scoreRange: { max: number };
  [key: string]: unknown;
}

interface GradeSingleCriterionResult {
  justification: string | string[];
  evidence: Array<{
    quote: string;
    paragraph: string;
    relatedAssessmentIndexes?: number[];
  }>;
  score: number | null;
  error?: string;
}

interface ReviseResult {
  revisedScore: number;
  rationale: string;
  error?: string;
}

interface TopicResult {
  topics: { label: string; keywords: string[] }[];
  assignments: Record<string, number>;
}

async function callApi(action: string, payload: Record<string, unknown>) {
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `API error ${res.status}`);
  }

  const data = await res.json();
  return data.result;
}

export const extractRubricCriteria = async (
  rubricContent: string
): Promise<Criterion[] | 'NO_VALID_RUBRIC'> => {
  return callApi('extractRubricCriteria', { rubricContent });
};

export const gradeSingleCriterion = async (
  essayContent: string,
  criterion: Criterion,
  options: GradeSingleCriterionOptions = {},
  contextList?: ContextItem[],
  rubricContent?: string
): Promise<GradeSingleCriterionResult> => {
  try {
    return await callApi('gradeSingleCriterion', {
      essayContent,
      criterion: { name: criterion.name, id: criterion.id, scoreRange: criterion.scoreRange, levels: criterion.levels },
      assessmentType: options.assessmentType,
      assessmentLength: options.assessmentLength,
      contextList,
      rubricContent,
    });
  } catch {
    return {
      justification: 'There was an error processing this criterion. Please try again.',
      evidence: [],
      score: null,
      error: 'REQUEST_FAILED',
    };
  }
};

export const generateOverallAssessment = async (
  essayContent: string,
  criteriaWithScores: CriterionWithScore[],
  _options: Record<string, unknown> = {},
  contextList?: ContextItem[]
): Promise<OverallAssessmentResult> => {
  try {
    return await callApi('generateOverallAssessment', {
      essayContent,
      criteriaWithScores,
      contextList,
    });
  } catch {
    return {
      strengths: 'There was an error generating the overall assessment.',
      improvements: 'Please review the individual criteria scores.',
      overallGrade: 'N/A',
      advice: 'Consider reviewing each criterion individually.',
    };
  }
};

export const reviseCriterionScoreWithJustification = async (
  essayContent: string,
  criterion: Criterion,
  originalJustification: string,
  editedJustification: string,
  originalScore: number
): Promise<ReviseResult> => {
  try {
    return await callApi('reviseCriterionScore', {
      essayContent,
      criterion: { name: criterion.name, scoreRange: criterion.scoreRange },
      originalJustification,
      editedJustification,
      originalScore,
    });
  } catch {
    return {
      revisedScore: originalScore,
      rationale: 'There was an error revising the score. The original score is retained.',
    };
  }
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  const result = await callApi('generateEmbedding', { text });
  return result.embedding ?? [];
};

export const extractTopics = async (
  summaries: { id: string; summary: string }[]
): Promise<TopicResult> => {
  return callApi('extractTopics', { essaySummaries: summaries });
};

const llmService = {
  extractRubricCriteria,
  gradeSingleCriterion,
  generateOverallAssessment,
  reviseCriterionScoreWithJustification,
  generateEmbedding,
  extractTopics,
};

export default llmService;

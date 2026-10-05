import type { ThresholdConfig, HallucinationResult, HallucinationThreshold } from '@/types';

/**
 * Threshold confidence levels for filtering hallucinations
 */
export const THRESHOLD_CONFIGS: Record<HallucinationThreshold, ThresholdConfig> = {
  low: { minConfidence: 0.9, minMatchScore: 0.3, severities: ['high'] },
  medium: { minConfidence: 0.8, minMatchScore: 0.5, severities: ['high', 'medium'] },
  high: { minConfidence: 0.6, minMatchScore: 0.7, severities: ['high', 'medium', 'low'] },
};

/**
 * Normalize text for comparison:
 * - Convert to lowercase
 * - Remove extra whitespace
 * - Normalize quotes and dashes
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\u201c\u201d\u2018\u2019]/g, '"')
    .replace(/[\u2014\u2013]/g, '-')
    .trim();
}

/**
 * Calculate similarity between two strings using Levenshtein distance.
 * Returns a value between 0 (no match) and 1 (perfect match).
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // For very long strings, use a simpler approach
  if (s1.length > 500 || s2.length > 500) {
    if (s2.includes(s1) || s1.includes(s2)) return 0.9;

    const words1 = new Set(s1.split(/\s+/).filter((w) => w.length > 3));
    const words2 = new Set(s2.split(/\s+/).filter((w) => w.length > 3));
    const intersection = [...words1].filter((w) => words2.has(w));
    return intersection.length / Math.max(words1.size, words2.size, 1);
  }

  // Levenshtein distance for shorter strings
  const matrix: number[][] = Array(s1.length + 1)
    .fill(null)
    .map(() => Array(s2.length + 1).fill(null));

  for (let i = 0; i <= s1.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return 1 - matrix[s1.length][s2.length] / maxLen;
}

/**
 * Check if a quote exists in the essay content.
 * Returns match result with confidence score.
 */
export function findQuoteInEssay(
  quote: string,
  essayContent: string,
  _threshold?: HallucinationThreshold
): HallucinationResult {
  if (!quote || !essayContent) {
    return { found: false, confidence: 0, matchType: 'no-content' };
  }

  const normalizedQuote = normalizeText(quote);
  const normalizedEssay = normalizeText(essayContent);

  // Skip very short quotes (less than 10 chars)
  if (normalizedQuote.length < 10) {
    return { found: true, confidence: 1, matchType: 'too-short' };
  }

  // 1. Exact match
  if (normalizedEssay.includes(normalizedQuote)) {
    return { found: true, confidence: 1, matchType: 'exact' };
  }

  // 2. Fuzzy match - check for partial matches using sliding window of words
  const words = normalizedQuote.split(/\s+/);
  if (words.length >= 3) {
    for (
      let windowSize = Math.min(words.length, 6);
      windowSize >= 3;
      windowSize--
    ) {
      for (let i = 0; i <= words.length - windowSize; i++) {
        const chunk = words.slice(i, i + windowSize).join(' ');
        if (normalizedEssay.includes(chunk)) {
          const confidence = (windowSize / words.length) * 0.9;
          return {
            found: true,
            confidence,
            matchType: 'partial',
            matchedChunk: chunk,
          };
        }
      }
    }
  }

  // 3. Similarity-based match - find best matching segment
  const quoteWords = words.length;
  const essayWords = normalizedEssay.split(/\s+/);

  let bestSimilarity = 0;
  let bestSegment = '';

  for (let i = 0; i < essayWords.length - quoteWords + 1; i++) {
    const segment = essayWords.slice(i, i + quoteWords + 2).join(' ');
    const similarity = calculateSimilarity(normalizedQuote, segment);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestSegment = segment;
    }
  }

  if (bestSimilarity >= 0.7) {
    return {
      found: true,
      confidence: bestSimilarity,
      matchType: 'fuzzy',
      closestMatch: bestSegment,
    };
  }

  // Not found - this is a potential hallucination
  return {
    found: false,
    confidence: 1 - bestSimilarity,
    matchType: 'not-found',
    closestMatch: bestSegment,
  };
}

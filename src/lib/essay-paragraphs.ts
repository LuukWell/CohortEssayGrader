/**
 * Guesses where the paragraph breaks are in an essay. Many essays come in as one
 * long string, so this returns break offsets instead of changing the text:
 * quote lookups and highlight start/end indices depend on the original content.
 */

const DISCOURSE_MARKERS: string[] = [
  // ordering / enumeration
  'First of all,', 'First,', 'Second,', 'Third,', 'Fourth,', 'Fifth,',
  'Finally,', 'Lastly,',
  // conclusion / summary
  'In conclusion,', 'To conclude,', 'In summary,', 'To summarize,',
  // contrast
  'However,', 'Nevertheless,', 'Nonetheless,', 'On the other hand,',
  // addition
  'Moreover,', 'Furthermore,', 'Additionally,', 'In addition,', 'Above all,',
  // example
  'For example,', 'For instance,',
  // consequence
  'Therefore,', 'Thus,', 'Hence,', 'As a result,', 'Consequently,',
  // sequence
  'Meanwhile,', 'Subsequently,', 'Next,', 'Then,',
];

/** Sentences-per-paragraph fallback before forcing a break. */
const FALLBACK_SENTENCES = 4;

/** Minimum characters between two adjacent breaks. Avoids stubby paragraphs. */
const MIN_PARAGRAPH_CHARS = 80;

function startsWithMarker(content: string, idx: number): boolean {
  for (const m of DISCOURSE_MARKERS) {
    if (content.startsWith(m, idx)) return true;
  }
  return false;
}

/**
 * Walk the string, returning the start indices of each sentence.
 * The first sentence start is the first non-whitespace character; subsequent
 * sentence starts are positions immediately after `[.!?]+\s+` runs.
 */
function findSentenceStarts(content: string): number[] {
  const starts: number[] = [];

  // First non-whitespace
  let i = 0;
  while (i < content.length && /\s/.test(content[i])) i++;
  if (i >= content.length) return starts;
  starts.push(i);

  const re = /[.!?]+(\s+)(?=["'"“‘(]?[A-Z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const start = m.index + m[0].length;
    if (start < content.length) starts.push(start);
  }
  return starts;
}

/**
 * Detect paragraph break offsets in the content.
 *
 * Returns a sorted, deduplicated list of indices i (0 < i < content.length).
 * Each i marks the start of a new paragraph. Never returns 0.
 */
export function detectParagraphBreaks(content: string): number[] {
  if (!content) return [];

  const breaks = new Set<number>();

  // 1. Existing newlines are always breaks.
  const nlRe = /\n+/g;
  let nm: RegExpExecArray | null;
  while ((nm = nlRe.exec(content)) !== null) {
    if (nm.index > 0) breaks.add(nm.index);
  }

  // 2. Heuristic walk over sentence starts.
  const starts = findSentenceStarts(content);
  let sinceLastBreak = 0;
  for (let s = 0; s < starts.length; s++) {
    const idx = starts[s];
    if (s === 0) {
      sinceLastBreak = 1;
      continue;
    }
    if (startsWithMarker(content, idx)) {
      breaks.add(idx);
      sinceLastBreak = 1;
      continue;
    }
    sinceLastBreak++;
    if (sinceLastBreak >= FALLBACK_SENTENCES) {
      breaks.add(idx);
      sinceLastBreak = 1;
    }
  }

  // 3. Sort + coalesce breaks that are too close together.
  const sorted = [...breaks].sort((a, b) => a - b);
  const out: number[] = [];
  for (const b of sorted) {
    const prev = out[out.length - 1];
    if (prev != null && b - prev < MIN_PARAGRAPH_CHARS) continue;
    out.push(b);
  }
  return out;
}

import { sentenceRanges, type Range } from './segmentation';

function isCaseOnly(original: string, replacement: string): boolean {
  if (original.length !== replacement.length) return false;
  return original.toLowerCase() === replacement.toLowerCase() && original !== replacement;
}

function isSentenceStart(text: string, idx: number): boolean {
  let i = idx - 1;
  while (i >= 0 && /[\s"'“”‘’\(\[\{]/.test(text[i])) i--;
  if (i < 0) return true;
  return /[.!?\n]/.test(text[i]);
}

export function bestAlignOriginalRange(
  fullText: string,
  expected: Range,
  original: string,
  replacement: string,
  before?: string,
  after?: string
): Range | null {
  if (!original) return null;
  const currentSlice = fullText.slice(expected.start, expected.end);
  if (currentSlice === original) return expected;

  // Prefer searching within the containing sentence; add small margin.
  const sents = sentenceRanges(fullText);
  const idx = sents.findIndex(r => r.start <= expected.start && expected.end <= r.end);
  const sent = idx >= 0 ? sents[idx] : { start: Math.max(0, expected.start - 120), end: Math.min(fullText.length, expected.end + 120) };
  const winStart = Math.max(0, sent.start - 20);
  const winEnd = Math.min(fullText.length, sent.end + 20);
  const neigh = fullText.slice(winStart, winEnd);

  const anchorsMatch = (abs: number) => {
    const end = abs + original.length;
    const prev = fullText.slice(Math.max(0, abs - (before?.length ?? 0)), abs);
    const next = fullText.slice(end, Math.min(fullText.length, end + (after?.length ?? 0)));
    const beforeOk = before ? prev.endsWith(before) : true;
    const afterOk = after ? next.startsWith(after) : true;
    return beforeOk && afterOk;
  };

  const cands: number[] = [];
  let j = neigh.indexOf(original);
  while (j !== -1) { const abs = winStart + j; if (anchorsMatch(abs)) cands.push(abs); j = neigh.indexOf(original, j + 1); }
  if (!cands.length) {
    // Fallback: allow any exact match
    let k = neigh.indexOf(original);
    while (k !== -1) { cands.push(winStart + k); k = neigh.indexOf(original, k + 1); }
  }
  if (!cands.length) return null;

  const caseOnly = isCaseOnly(original, replacement);
  const target = expected.start;
  let bestPos = cands[0];
  let bestScore = Math.abs(cands[0] - target) + (caseOnly && isSentenceStart(fullText, cands[0]) ? -50 : 0);
  for (let i = 1; i < cands.length; i++) {
    const pos = cands[i];
    const score = Math.abs(pos - target) + (caseOnly && isSentenceStart(fullText, pos) ? -50 : 0);
    if (score < bestScore) { bestScore = score; bestPos = pos; }
  }
  return { start: bestPos, end: bestPos + original.length };
}


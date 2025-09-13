import type { Suggestion } from '$lib/features/grammar/model/suggestion';
import { policy, type DiffKind, ceilDiv } from './policies';
import { sentenceRanges } from '$lib/features/grammar/util/segmentation';

export function isLetter(ch: string) {
  return /\p{L}/u.test(ch);
}

export function tokenize(s: string): string[] {
  // coarse tokens: words, numbers, symbols
  return s.match(/\p{L}+|\d+|\S/gu) ?? [];
}

export function measureEdit(original: string, replacement: string) {
  const a = tokenize(original);
  const b = tokenize(replacement);
  const changedTokens = tokenEditDistance(a, b);
  return { changedTokens, aTokens: a.length, bTokens: b.length };
}

function tokenEditDistance(a: string[], b: string[]): number {
  // Levenshtein over short token arrays; sizes are small in practice
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

export function violatesBoundary(s: Suggestion, fullText: string): boolean {
  const { start, end } = s.range;
  const r = s.replacement ?? '';
  // Reject mid-token punctuation insertions .,!?:; when both sides are letters
  if (/[.,!?:;]/.test(r)) {
    const L = fullText[start - 1] ?? '';
    const R = fullText[end] ?? '';
    if (isLetter(L) && isLetter(R)) return true;
  }
  return false;
}

export function addsLetters(original: string, replacement: string): boolean {
  const letters = (x: string) => (x.match(/\p{L}/gu) ?? []).length;
  return letters(replacement) > letters(original);
}

export function containingSentenceTokenCount(text: string, start: number, end: number): number {
  const ranges = sentenceRanges(text);
  const idx = ranges.findIndex((r) => r.start <= start && end <= r.end);
  const r = idx >= 0 ? ranges[idx] : { start: Math.max(0, start - 40), end: Math.min(text.length, end + 40) };
  return tokenize(text.slice(r.start, r.end)).length || 1;
}

export function paragraphRanges(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let s = 0;
  const push = (e: number) => { if (e > s) out.push({ start: s, end: e }); s = e + 2; };
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === '\n' && text[i + 1] === '\n') push(i + 2);
  }
  if (s < text.length) out.push({ start: s, end: text.length });
  return out;
}

export function paragraphIndexOf(range: { start: number; end: number }, paragraphs: { start: number; end: number }[]): number {
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (range.start >= p.start && range.end <= p.end) return i;
  }
  return Math.max(0, Math.min(paragraphs.length - 1, paragraphs.findIndex(() => true)));
}

export function styleMinimalityPass(s: Suggestion, fullText: string): { ok: boolean; reason?: string; changedTokens?: number } {
  const original = s.original ?? fullText.slice(s.range.start, s.range.end);
  const rep = s.replacement ?? '';
  const { changedTokens } = measureEdit(original, rep);
  const sentenceTokens = containingSentenceTokenCount(fullText, s.range.start, s.range.end);
  const ratio = changedTokens / Math.max(1, sentenceTokens);

  const k = (s.diffKind as DiffKind | undefined);
  const diffAllowed = k ? policy.diffKindAllowed.includes(k) : false;

  if (violatesBoundary(s, fullText)) return { ok: false, reason: 'boundary' };
  if (!diffAllowed && addsLetters(original, rep)) return { ok: false, reason: 'addsLetters' };
  if (!diffAllowed && ratio > policy.maxTokenChangeRatio) return { ok: false, reason: 'mininality' };
  return { ok: true, changedTokens };
}

export function styleBudgets(text: string, correctnessCount: number) {
  const k = ceilDiv(text.length, 1000);
  const base = Math.min(policy.per1kStyleBase, Math.floor(policy.per1kStyleRatioOfCorrectness * correctnessCount));
  // If no correctness at all, allow a small base hint budget to avoid zeroing style entirely
  const per1k = base > 0 ? base : 3;
  return { global: per1k * k, perParagraphWithCorrectness: policy.paragraphStyleCapIfCorrectnessPresent };
}


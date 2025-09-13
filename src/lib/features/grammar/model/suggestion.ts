import { bestAlignOriginalRange } from '$lib/features/grammar/util/locate';

export type Range = {
  start: number; // inclusive index in full text
  end: number; // exclusive index
};

export type SuggestionSource = 'local' | 'ai';

export type SuggestionSeverity = 'info' | 'warn' | 'error';

export type Suggestion = {
  id: string;
  title: string;
  message?: string;
  category: 'spacing' | 'punctuation' | 'spelling' | 'style' | 'other';
  severity: SuggestionSeverity;
  range: Range;
  replacement: string; // full replacement for [range.start, range.end)
  source: SuggestionSource;
  applied?: boolean; // mark as applied without removing from list
  // Optional context anchors for resilient reconciliation
  original?: string; // original substring the model saw
  before?: string;  // up to ~20 chars preceding in the model's view
  after?: string;   // up to ~20 chars following in the model's view
  confidence?: number; // [0,1]
  // Optional integrity hint for stronger dedupe/reconciliation
  checksum?: string; // hash of original (e.g., sha256 hex)
  // Style/minimality metadata (optional, from model or computed server-side)
  diffKind?: 'whitespace' | 'punctuation' | 'case' | 'wording';
  changedTokens?: number;
  justification?: string;
};

export type SuggestRequest = {
  text: string;
  apiKey?: string;
};

export function applySuggestion(text: string, s: Suggestion): string {
  // Try to re-locate by anchors if the declared range doesn't match the provided original
  const located = relocateByAnchors(text, s) ?? s.range;
  const snapped = snapToGraphemeBoundaries(text, located);
  const before = text.slice(0, snapped.start);
  const after = text.slice(snapped.end);
  return before + s.replacement + after;
}

// Revert a previously applied suggestion by locating the replacement and restoring the original text.
export function revertSuggestion(text: string, s: Suggestion): string {
  const inverse: Suggestion = {
    ...s,
    original: s.replacement,
    replacement: s.original ?? ''
  };
  const located = relocateByAnchors(text, inverse) ?? s.range;
  const snapped = snapToGraphemeBoundaries(text, located);
  const before = text.slice(0, snapped.start);
  const after = text.slice(snapped.end);
  return before + (s.original ?? '') + after;
}

export function clampRange(range: Range, text: string): Range {
  const len = text.length;
  const start = Math.max(0, Math.min(range.start, len));
  const end = Math.max(start, Math.min(range.end, len));
  return { start, end };
}

// Attempts to re-locate a suggestion range using provided anchors and original text.
// Returns a new range if a better match is found; otherwise null.
function relocateByAnchors(text: string, s: Suggestion): Range | null {
  const { range, original, before, after } = s;
  const currentSlice = text.slice(range.start, range.end);
  if (original && currentSlice === original) return null; // already aligned

  // Shared alignment (same as server): within sentence, honor anchors, prefer sentence start for case-only
  if (original && original.length) {
    const aligned = bestAlignOriginalRange(text, range, original, s.replacement ?? '', before, after);
    if (aligned) return aligned;
  }

  // Final local fallback: small window + whitespace-normalized prefix match
  const tiny = (original?.length ?? 0) <= 2;
  const window = tiny ? 80 : 300;
  const start0 = Math.max(0, range.start - window);
  const end0 = Math.min(text.length, range.start + window);
  const neigh = text.slice(start0, end0);

  const anchorsMatch = (foundStart: number) => {
    if (!original) return true;
    const foundEnd = foundStart + original.length;
    const prev = text.slice(Math.max(0, foundStart - (before?.length ?? 0)), foundStart);
    const next = text.slice(foundEnd, Math.min(text.length, foundEnd + (after?.length ?? 0)));
    const beforeOk = before ? prev.endsWith(before) : true;
    const afterOk = after ? next.startsWith(after) : true;
    return beforeOk && afterOk;
  };

  // Fallback: try fuzzy by trimming whitespace
  if (original) {
    const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
    const nOrig = norm(original);
    for (let ofs = 0; ofs < neigh.length; ofs++) {
      const t = neigh.slice(ofs, Math.min(neigh.length, ofs + original.length + 40));
      if (norm(t).startsWith(nOrig) && anchorsMatch(start0 + ofs)) {
        return { start: start0 + ofs, end: start0 + ofs + (original.length) };
      }
    }
  }
  return null;
}

// Snap a range to grapheme cluster boundaries to avoid splitting emoji/combining marks.
function snapToGraphemeBoundaries(text: string, range: Range): Range {
  try {
    // @ts-ignore: Intl.Segmenter may not include sentence in older TS libs but exists at runtime
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
    let prevBoundary = 0;
    let start = 0;
    let end = text.length;
    for (const part of seg.segment(text)) {
      const idx = (part as any).index as number; // start index of this grapheme
      if (idx <= range.start) start = idx; // last boundary not after start
      if (idx < range.end) prevBoundary = idx; else { end = idx; break; }
    }
    // If we never broke (range extends to end), keep end as text.length
    return { start, end };
  } catch {
    // Fallback: clamp as-is
    return clampRange(range, text);
  }
}

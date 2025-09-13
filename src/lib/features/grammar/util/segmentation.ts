export type Range = { start: number; end: number };

// Sentence segmentation using Intl.Segmenter when available; falls back to a conservative splitter.
export function sentenceRanges(text: string, locale = 'en'): Range[] {
  // Prefer Intl.Segmenter sentence if supported
  try {
    // @ts-ignore: sentence granularity may not be in older TS libdom
    const seg = new Intl.Segmenter(locale, { granularity: 'sentence' });
    const out: Range[] = [];
    for (const s of seg.segment(text) as any) {
      const idx: number = s.index;
      const segText: string = s.segment ?? text.slice(idx);
      const end = idx + segText.length;
      if (end > idx) out.push({ start: idx, end });
    }
    if (out.length) return normalize(out);
  } catch {}

  // Fallback: improved heuristic with basic abbreviation handling and paragraph breaks
  const abbrev = /\b(?:e\.g|i\.e|Mr|Ms|Mrs|Dr|Prof|Sr|Jr|vs|approx)\.$/;
  const out: Range[] = [];
  let start = 0;
  const push = (end: number) => { if (end > start) out.push({ start, end }); start = end; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      // Double newline -> hard break
      if (i + 1 < text.length && text[i + 1] === '\n') { push(i + 2); i++; continue; }
    }
    if (/[.!?]/.test(ch)) {
      const prev = text.slice(Math.max(0, i - 8), i + 1);
      if (abbrev.test(prev)) continue; // skip common abbreviations
      // include trailing quotes/brackets/spaces
      let j = i + 1;
      while (j < text.length && /[)\]"'\s]/.test(text[j])) j++;
      push(j);
      i = j - 1;
    }
  }
  if (start < text.length) out.push({ start, end: text.length });
  return normalize(out);
}

function normalize(ranges: Range[]): Range[] {
  const out: Range[] = [];
  for (const r of ranges) {
    const s = Math.max(0, Math.min(r.start, r.end));
    const e = Math.max(s, r.end);
    if (out.length && s <= out[out.length - 1].end) {
      out[out.length - 1].end = Math.max(out[out.length - 1].end, e);
    } else {
      out.push({ start: s, end: e });
    }
  }
  return out;
}

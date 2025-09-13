import { customAlphabet } from 'nanoid';
import type { Suggestion } from '../model/suggestion';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

export function localAnalyze(text: string): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Rule: Double or multiple spaces between words -> single space
  const multiSpace = /([^\S\n]{2,})/g; // 2+ spaces, not newlines
  for (const m of text.matchAll(multiSpace)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    suggestions.push({
      id: nano(),
      title: 'Change the spacing',
      message: 'Reduce multiple spaces to a single space.',
      category: 'spacing',
      severity: 'info',
      range: { start, end },
      original: text.slice(start, end),
      replacement: ' ',
      source: 'local'
    });
  }

  // Rule: Space before punctuation (e.g., "word , word") -> remove extra space
  const spaceBeforePunct = /(\s+)([,.!?;:])(?!\w)/g;
  for (const m of text.matchAll(spaceBeforePunct)) {
    const sp = m[1];
    const start = (m.index ?? 0);
    const end = start + sp.length;
    suggestions.push({
      id: nano(),
      title: 'Use correct spacing',
      message: 'Remove the space before punctuation.',
      category: 'spacing',
      severity: 'info',
      range: { start, end },
      original: text.slice(start, end),
      replacement: '',
      source: 'local'
    });
  }

  // Rule: Missing sentence-ending punctuation at end of paragraph
  if (text.trim().length > 0) {
    const trimmed = text.trimEnd();
    const last = trimmed.at(-1)!;
    if (!/[.!?\n]/.test(last)) {
      const start = trimmed.length;
      const delta = text.length - trimmed.length;
      const end = start + delta; // trailing whitespace range
      suggestions.push({
        id: nano(),
        title: 'Punctuation mistake',
        message: 'Add a period at the end of the sentence.',
        category: 'punctuation',
        severity: 'warn',
      range: { start, end },
      original: text.slice(start, end),
      replacement: '.'.padEnd(delta + 1, ' '), // keep trailing spaces length
      source: 'local'
    });
    }
  }

  // Rule: Repeated word (the the) -> single occurrence
  const repeatedWord = /\b(\w+)(\s+)(\1)\b/gi;
  for (const m of text.matchAll(repeatedWord)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const first = m[1];
    suggestions.push({
      id: nano(),
      title: 'Repeated word',
      message: `Remove duplicate "${first}".`,
      category: 'style',
      severity: 'info',
      range: { start, end },
      original: text.slice(start, end),
      replacement: first,
      source: 'local'
    });
  }

  // Rule: No space after punctuation (e.g., "Hello,world") -> insert a space
  const noSpaceAfterPunct = /([,.!?;:])(\p{L})/gu; // letter after punctuation
  for (const m of text.matchAll(noSpaceAfterPunct)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    suggestions.push({
      id: nano(),
      title: 'Add space after punctuation',
      message: 'Insert a space after punctuation.',
      category: 'spacing',
      severity: 'info',
      range: { start, end },
      original: text.slice(start, end),
      replacement: `${m[1]} ${m[2]}`,
      source: 'local'
    });
  }

  // Rule: Capitalize sentence starts
  const sentenceStartLower = /(^|[.!?]\s+)([a-z])/gm;
  for (const m of text.matchAll(sentenceStartLower)) {
    const lead = m[1];
    const idx = (m.index ?? 0) + lead.length;
    suggestions.push({
      id: nano(),
      title: 'Capitalize sentence',
      message: 'Capitalize the first letter of the sentence.',
      category: 'style',
      severity: 'info',
      range: { start: idx, end: idx + 1 },
      original: text.slice(idx, idx + 1),
      replacement: m[2].toUpperCase(),
      source: 'local'
    });
  }

  // Rule: Condense repeated punctuation (e.g., "!!" -> "!")
  const repeatedPunct = /([.!?])\1+/g;
  for (const m of text.matchAll(repeatedPunct)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    suggestions.push({
      id: nano(),
      title: 'Reduce punctuation',
      message: 'Use a single punctuation mark.',
      category: 'punctuation',
      severity: 'info',
      range: { start, end },
      original: text.slice(start, end),
      replacement: m[1],
      source: 'local'
    });
  }

  // Rule: Normalize spaces after colon to exactly one space
  const colonDoubleSpace = /:(\s{2,})/g;
  for (const m of text.matchAll(colonDoubleSpace)) {
    const start = (m.index ?? 0) + 1; // spaces after ':'
    const end = start + m[1].length;
    suggestions.push({
      id: nano(),
      title: 'Normalize colon spacing',
      message: 'Use a single space after a colon.',
      category: 'spacing',
      severity: 'info',
      range: { start, end },
      original: text.slice(start, end),
      replacement: ' ',
      source: 'local'
    });
  }

  // Rule: Spaced hyphen used as dash -> em dash without spaces
  const spacedHyphenAsDash = /(\S)\s-\s(\S)/g;
  for (const m of text.matchAll(spacedHyphenAsDash)) {
    const idx = m.index ?? 0;
    const start = idx + 1; // from space before '-'
    const end = idx + m[0].length; // through space after '-'
    suggestions.push({
      id: nano(),
      title: 'Use an em dash',
      message: 'Replace spaced hyphen with an em dash.',
      category: 'style',
      severity: 'info',
      range: { start, end },
      original: text.slice(start, end),
      replacement: `${m[1]}—${m[2]}`,
      source: 'local'
    });
  }

  // Rule: Ellipsis normalization ... -> …
  for (const m of text.matchAll(/\.\.\./g)) {
    const start = m.index ?? 0;
    const end = start + 3;
    suggestions.push({
      id: nano(),
      title: 'Use ellipsis character',
      message: 'Replace three dots with a single ellipsis (…).',
      category: 'style',
      severity: 'info',
      range: { start, end },
      original: '...',
      replacement: '…',
      source: 'local'
    });
  }

  // Rule: Common misspellings (small demo set)
  const dict: Record<string, string> = {
    recieve: 'receive',
    accomodate: 'accommodate',
    seperate: 'separate',
    definately: 'definitely',
    occured: 'occurred',
    occurance: 'occurrence'
  };
  const misspell = new RegExp(`\\b(${Object.keys(dict).join('|')})\\b`, 'gi');
  for (const m of text.matchAll(misspell)) {
    const wrong = m[0];
    const start = m.index ?? 0;
    const end = start + wrong.length;
    const key = wrong.toLowerCase();
    const replacement = dict[key];
    if (!replacement) continue;
    suggestions.push({
      id: nano(),
      title: 'Spelling',
      message: `Replace "${wrong}" with "${replacement}".`,
      category: 'spelling',
      severity: 'warn',
      range: { start, end },
      original: text.slice(start, end),
      replacement,
      source: 'local'
    });
  }

  return mergeOverlaps(suggestions);
}

function mergeOverlaps(items: Suggestion[]): Suggestion[] {
  // naive dedupe by identical ranges + title
  const key = (s: Suggestion) => `${s.range.start}-${s.range.end}-${s.title}-${s.replacement}`;
  const map = new Map<string, Suggestion>();
  for (const s of items) {
    const k = key(s);
    if (!map.has(k)) map.set(k, s);
  }
  return Array.from(map.values()).sort((a, b) => a.range.start - b.range.start);
}

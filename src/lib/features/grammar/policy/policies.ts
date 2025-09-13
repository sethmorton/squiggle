export type DiffKind = 'whitespace' | 'punctuation' | 'case' | 'wording';

export const policy = {
  minConfidence: {
    style: 0.75,
    other: 0.7
  },
  maxTokenChangeRatio: 0.06, // vs. containing sentence token count
  per1kStyleBase: 3,
  per1kStyleRatioOfCorrectness: 0.15,
  paragraphStyleCapIfCorrectnessPresent: 1,
  diffKindAllowed: ['whitespace', 'punctuation', 'case'] as DiffKind[]
};

export function ceilDiv(a: number, b: number) {
  return Math.floor((a + b - 1) / b);
}


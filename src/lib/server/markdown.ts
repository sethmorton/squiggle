import type { Range } from '$lib/features/grammar/util/segmentation';

// Lightweight Markdown-aware forbidden range detector.
// Uses remark-parse when available to mask non-prose regions like fenced code, inline code, HTML, and tables.
// Falls back to regex for URLs/link targets.
export async function computeForbiddenMd(text: string): Promise<Range[]> {
  const ranges: Range[] = [];
  const push = (s: number, e: number) => { if (e > s) ranges.push({ start: s, end: e }); };

  try {
    const { unified } = await import('unified');
    const remarkParse = (await import('remark-parse')).default as any;
    const remarkGfm = (await import('remark-gfm')).default as any;
    const tree: any = await unified().use(remarkParse).use(remarkGfm).parse(text);
    const visit = (node: any) => {
      const type = node?.type;
      const pos = node?.position;
      const start: number | undefined = pos?.start?.offset;
      const end: number | undefined = pos?.end?.offset;
      if (typeof start === 'number' && typeof end === 'number') {
        // Non-prose nodes to forbid entirely
        if (
          type === 'code' ||
          type === 'inlineCode' ||
          type === 'html' ||
          type === 'table' ||
          type === 'tableRow' ||
          type === 'tableCell'
        ) {
          push(start, end);
        }
        // Autolink <http://...> is parsed as link covering the full span; protect fully.
        if (type === 'link' && /^<.*>$/.test(text.slice(start, end))) {
          push(start, end);
        }
      }
      const children = (node as any)?.children as any[] | undefined;
      if (children) for (const c of children) visit(c);
    };
    visit(tree);
  } catch {
    // If remark is unavailable, continue with regex-only below
  }

  // Regex protection for link targets and bare URLs
  for (const m of text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    const i = m.index ?? -1; if (i >= 0) {
      const open = text.indexOf('(', i);
      const close = text.indexOf(')', open + 1);
      if (open !== -1 && close !== -1) push(open, close + 1);
    }
  }
  for (const m of text.matchAll(/https?:\/\/\S+/g)) {
    const i = m.index ?? -1; if (i >= 0) push(i, i + m[0].length);
  }
  return mergeRanges(ranges);
}

// Collect prose node ranges (paragraphs, headings). Used to target only human-readable spans.
export async function computeProseMd(text: string): Promise<Range[]> {
  const ranges: Range[] = [];
  const push = (s: number, e: number) => { if (e > s) ranges.push({ start: s, end: e }); };
  try {
    const { unified } = await import('unified');
    const remarkParse = (await import('remark-parse')).default as any;
    const remarkGfm = (await import('remark-gfm')).default as any;
    const tree: any = await unified().use(remarkParse).use(remarkGfm).parse(text);
    const visit = (node: any) => {
      const type = node?.type;
      const pos = node?.position;
      const start: number | undefined = pos?.start?.offset;
      const end: number | undefined = pos?.end?.offset;
      if (typeof start === 'number' && typeof end === 'number') {
        if (type === 'paragraph' || type === 'heading') {
          push(start, end);
        }
      }
      const children = (node as any)?.children as any[] | undefined;
      if (children) for (const c of children) visit(c);
    };
    visit(tree);
  } catch {}
  return mergeRanges(ranges);
}

export function mergeRanges(r: Range[]): Range[] {
  if (r.length === 0) return r;
  const a = [...r].sort((x, y) => x.start - y.start);
  const out: Range[] = [];
  let cur = { ...a[0] };
  for (let i = 1; i < a.length; i++) {
    const nx = a[i];
    if (nx.start <= cur.end) cur.end = Math.max(cur.end, nx.end);
    else { out.push(cur); cur = { ...nx }; }
  }
  out.push(cur);
  return out;
}

import type { RequestHandler } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';
import { customAlphabet } from 'nanoid';
import type { Suggestion } from '$lib/features/grammar/model/suggestion';
import { sentenceRanges as sentenceRangesIntl } from '$lib/features/grammar/util/segmentation';
import { computeForbiddenMd, computeProseMd, mergeRanges as mergeRangesMd } from '$lib/server/markdown';
import crypto from 'node:crypto';
import { localAnalyze } from '$lib/features/grammar/services/localRules';
import { createDevLogger, clip } from '$lib/utils/devlog';
import { dev } from '$app/environment';
import { policy } from '$lib/features/grammar/policy/policies';
import { styleMinimalityPass, paragraphRanges as computeParagraphs, paragraphIndexOf, styleBudgets } from '$lib/features/grammar/policy/checker';
import { bestAlignOriginalRange } from '$lib/features/grammar/util/locate';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);
const MODEL = process.env.SQUIGGLE_MODEL || 'gemini-2.0-flash';
const SINGLESHOT_MAX = parseInt(process.env.SQUIGGLE_SINGLESHOT_MAX || '4500', 10);
const MAX_TEXT = parseInt(process.env.SQUIGGLE_MAX_TEXT || '100000', 10);
const MAX_CONCURRENCY = Math.max(1, parseInt(process.env.SQUIGGLE_MAX_CONCURRENCY || '4', 10));
// Style on by default; allow hard-off via env
const ENABLE_STYLE = process.env.SQUIGGLE_ENABLE_STYLE !== '0';
const ENABLE_OTHER = process.env.SQUIGGLE_ENABLE_OTHER !== '0'; // default on
const STYLE_QUOTA = ENABLE_STYLE ? parseInt(process.env.SQUIGGLE_STYLE_QUOTA || '9999', 10) : 0; // emergency cap only

export const POST: RequestHandler = async ({ request }) => {
	const { text, apiKey, scope } = (await request.json()) as {
		text?: unknown;
		apiKey?: unknown;
		scope?: { start: number; end: number } | null;
	};
	if (typeof text !== 'string' || typeof apiKey !== 'string' || !text.length || !apiKey.length) {
		return new Response('Missing text or apiKey', { status: 400 });
	}
	if (text.length > MAX_TEXT) {
		return new Response('Text too large', { status: 413 });
	}

	try {
		const log = createDevLogger('grammar:suggest', dev || process.env.SQUIGGLE_DEV_LOG === '1');
		log.step('request', { textLen: text.length, scopeStart: scope?.start ?? null, scopeEnd: scope?.end ?? null });
		const baseStart = clampInt(scope?.start ?? 0, 0, text.length);
		const baseEnd = clampInt(scope?.end ?? text.length, 0, text.length);
		const useSlice = baseEnd > baseStart && baseEnd - baseStart < text.length;
		const sliceText = useSlice ? text.slice(baseStart, baseEnd) : text;
		log.info('slice', { baseStart, baseEnd, useSlice, sliceLen: sliceText.length });

		const key = hash(sliceText + '|' + baseStart + '-' + baseEnd + '|' + PROMPT_VERSION + '|' + MODEL + '|' + SINGLESHOT_MAX);
		const cached = getCache(key);
		if (cached) {
			log.info('cache-hit', { suggestions: cached.length });
			return new Response(JSON.stringify({ suggestions: shiftSuggestions(cached, baseStart) }), {
				headers: { 'Content-Type': 'application/json', 'x-cache': 'hit', 'x-trace-id': log.traceId }
			});
		}
		const ai = new GoogleGenAI({ apiKey });
		log.info('llm:model', { model: MODEL });
		const abortSignal = request.signal;

		// Deterministic local pass on the slice first; filter against forbidden
		const tForb = log.time('forbidden');
		const forbiddenWhole = await computeForbidden(sliceText);
		tForb.end({ count: forbiddenWhole.length, samples: forbiddenWhole.slice(0, 3).map(r => ({ s: r.start, e: r.end, preview: clip(sliceText.slice(r.start, Math.min(sliceText.length, r.start + 80)), 80) })) });
		const proseRanges = await computeProseMd(sliceText);
		log.info('prose', { count: proseRanges.length, samples: proseRanges.slice(0, 3).map(r => ({ s: r.start, e: r.end })) });
		const tLocal = log.time('local-rules');
		const local = localAnalyze(sliceText)
			.filter((s) => withinRanges(s.range, proseRanges) && !intersectsForbidden(s.range, forbiddenWhole))
			.map((s) => ({ ...s, checksum: s.original ? hash(s.original) : undefined }));
		tLocal.end({ local: local.length, sample: local.slice(0,5).map(s => ({ title: s.title, cat: s.category, start: s.range.start, end: s.range.end, repl: clip(s.replacement, 30) })) });

		// Build LLM chunks: prose-only + sentence-aligned when long
		const chunks =
			sliceText.length <= SINGLESHOT_MAX
				? [{ start: 0, end: sliceText.length, content: sliceText, prefixLen: 0 }]
				: proseSentencePack(sliceText, proseRanges, 3000, 250);
		log.info('chunks', { count: chunks.length, sizes: chunks.map(c => c.end - c.start), prefix: chunks.map(c => c.prefixLen) });

		const runners = chunks.map((c, idx) => async () => {
			log.step('llm:prompt', { idx, contentPreview: clip(c.content, 200), prefixLen: c.prefixLen, contentLen: c.content.length });
			const result = await ai.models.generateContent({
				model: MODEL,
				contents: buildPromptWithPrefix(c.content, c.prefixLen),
				config: {
					abortSignal,
					temperature: 0.2,
					topP: 0.9,
					topK: 40,
					responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'object',
                        properties: {
                            suggestions: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    required: ['title', 'category', 'severity', 'range', 'replacement'],
                                    properties: {
                                        title: { type: 'string' },
                                        message: { type: 'string' },
                                        category: {
                                            type: 'string',
                                            enum: ['spacing', 'punctuation', 'spelling', 'style', 'other']
                                        },
                                        severity: { type: 'string', enum: ['info', 'warn', 'error'] },
                                        range: {
                                            type: 'object',
                                            required: ['start', 'end'],
                                            properties: { start: { type: 'integer' }, end: { type: 'integer' } }
                                        },
                                        replacement: { type: 'string' },
                                        original: { type: 'string' },
                                        before: { type: 'string', minLength: 0, maxLength: 8 },
                                        after: { type: 'string', minLength: 0, maxLength: 8 },
                                        confidence: { type: 'number', minimum: 0, maximum: 1 },
                                        diffKind: { type: 'string', enum: ['whitespace', 'punctuation', 'case', 'wording'] },
                                        changedTokens: { type: 'integer' },
                                        justification: { type: 'string' }
                                    }
                                }
                            }
                        },
                        required: ['suggestions']
                    }
                }
            });
			const raw = result.text ?? '';
			log.info('llm:raw', { idx, textLen: raw.length, preview: clip(raw, 160) });
			const parsed = safeParseJson(raw);
			const forbidden = await computeForbidden(sliceText);
			const parsedArr: any[] = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
			const part = parsedArr
					.filter((s: any) => typeof s?.range?.start === 'number' && typeof s?.range?.end === 'number')
					.map((s: any) => ({
                            id: nano(),
                            title: String(s.title ?? 'Suggestion'),
                            message: s.message ? String(s.message) : undefined,
                            category: validCategory(String(s.category ?? 'other')),
                            severity: validSeverity(String(s.severity ?? 'info')),
                            range: {
                                start: clampInt(((s.range?.start ?? 0) - (c.prefixLen ?? 0)) + c.start, 0, sliceText.length),
                                end: clampInt(((s.range?.end ?? 0) - (c.prefixLen ?? 0)) + c.start, 0, sliceText.length)
                            },
						replacement: String(s.replacement ?? '') || '',
						source: 'ai' as const,
                            original: typeof s.original === 'string'
                                ? s.original
                                : (() => {
                                    const start = clampInt(((s.range?.start ?? 0) - (c.prefixLen ?? 0)) + c.start, 0, sliceText.length);
                                    const end = clampInt(((s.range?.end ?? 0) - (c.prefixLen ?? 0)) + c.start, 0, sliceText.length);
                                    return sliceText.slice(start, end);
                                  })(),
                            checksum: (() => {
                                const o = typeof s.original === 'string' && s.original.length
                                    ? s.original
                                    : (() => {
                                        const start = clampInt(((s.range?.start ?? 0) - (c.prefixLen ?? 0)) + c.start, 0, sliceText.length);
                                        const end = clampInt(((s.range?.end ?? 0) - (c.prefixLen ?? 0)) + c.start, 0, sliceText.length);
                                        return sliceText.slice(start, end);
                                      })();
                                return o ? hash(o) : undefined;
                            })(),
                            before: typeof s.before === 'string' ? s.before : undefined,
                            after: typeof s.after === 'string' ? s.after : undefined,
                            confidence:
                                typeof s.confidence === 'number' && s.confidence >= 0 && s.confidence <= 1
                                    ? s.confidence
                                    : undefined,
                            diffKind: ((): any => {
                                const dk = typeof s.diffKind === 'string' ? s.diffKind : undefined;
                                const ok = ['whitespace','punctuation','case','wording'];
                                return ok.includes(String(dk)) ? dk : undefined;
                            })(),
                            changedTokens: typeof s.changedTokens === 'number' ? s.changedTokens : undefined,
                            justification: typeof s.justification === 'string' ? s.justification : undefined
						})) as Suggestion[];
			const partFiltered = part
					.filter((s) => s.range.start >= (c.prefixLen ?? 0))
					.filter((s) => !intersectsForbidden(s.range, forbidden))
					.filter((s) => withinRanges(s.range, proseRanges));
			// Try to reconcile with original text when provided
			// First reconcile ranges, then apply a sanity filter to drop pathological edits
			const afterReconcile = partFiltered.map((p, idx2) => {
				const s = (parsed?.suggestions?.[idx2] as any) ?? {};
				const original: string | undefined =
					typeof s.original === 'string' && s.original.length ? s.original : undefined;
				// Adjust from slice to full-text coordinates
				const shifted = shiftSuggestion(p, baseStart);
				return reconcileOriginal(shifted, original, text);
			}).filter((x): x is Suggestion => !!x);
			const reconciled = afterReconcile.filter((cand) => sanityOk(cand, text));
			const stats = {
				parsed: parsedArr.length,
				filteredByMissingRange: parsedArr.filter((s: any) => !(typeof s?.range?.start === 'number' && typeof s?.range?.end === 'number')).length,
				filteredByPrefix: parsedArr.filter((s: any) => typeof s?.range?.start === 'number' && s.range.start < (c.prefixLen ?? 0)).length,
				filteredByForbidden: partFiltered.length < part.length ? (part.length - partFiltered.length) : 0,
				filteredBySanity: afterReconcile.length - reconciled.length,
				keptAfterReconcile: reconciled.length
			};
			log.info('llm:parsed', { idx, ...stats });
			return reconciled;
		});

            // Concurrency throttle for LLM calls
            const collected: Suggestion[][] = [];
            for (let i = 0; i < runners.length; i += MAX_CONCURRENCY) {
                const batch = await Promise.all(runners.slice(i, i + MAX_CONCURRENCY).map((fn) => fn()));
                collected.push(...batch);
            }
            const combined = [...local.map((s) => shiftSuggestion(s, baseStart)), ...collected.flat()];
            const nd: any = {};
            const cleaned = normalizeAndDedupe(combined, text, nd);
            const catCounts = cleaned.reduce((acc: Record<string, number>, s) => { acc[s.category] = (acc[s.category] ?? 0) + 1; return acc; }, {} as Record<string, number>);
            const sevCounts = cleaned.reduce((acc: Record<string, number>, s) => { acc[s.severity] = (acc[s.severity] ?? 0) + 1; return acc; }, {} as Record<string, number>);
            log.step('finalize', { local: local.length, ai: combined.length - local.length, cleaned: cleaned.length, contentDedupe: nd.afterContentDedupe, afterConfidence: nd.afterConfidence, styleDroppedByMinimality: nd.styleDroppedByMinimality, styleDroppedByBoundary: nd.styleDroppedByBoundary, styleDroppedByDensity: nd.styleDroppedByDensity, styleKept: nd.styleKept, globalStyleBudget: nd.globalStyleBudget, byCategory: catCounts, bySeverity: sevCounts, sample: cleaned.slice(0,5).map(s => ({ title: s.title, cat: s.category, sev: s.severity, start: s.range.start, end: s.range.end, repl: clip(s.replacement, 40), diff: s.diffKind, ct: s.changedTokens })) });
		setCache(key, unshiftSuggestions(cleaned, baseStart));

		return new Response(JSON.stringify({ suggestions: cleaned }), {
			headers: { 'Content-Type': 'application/json', 'x-trace-id': log.traceId }
		});
	} catch (err: any) {
		console.error('Gemini error', { name: err?.name, status: err?.status, message: err?.message });
		const status = typeof err?.status === 'number' && err.status >= 400 && err.status <= 599 ? err.status : 502;
		const msg = status === 401 || status === 403 ? 'Unauthorized' : 'Upstream error';
		return new Response(msg, { status });
	}
};

function safeParseJson(s: string) {
	// Best-effort: strip triple backticks if the model wrapped JSON
	const trimmed = s
		.trim()
		.replace(/^```(?:json)?/i, '')
		.replace(/```$/, '');
	try {
		return JSON.parse(trimmed);
	} catch {
		return {};
	}
}

function clampInt(v: unknown, min: number, max: number): number {
	const n = typeof v === 'number' ? v : parseInt(String(v ?? 0), 10);
	if (Number.isNaN(n)) return min;
	return Math.max(min, Math.min(max, n));
}

function validCategory(c: string): Suggestion['category'] {
	const ok = ['spacing', 'punctuation', 'spelling', 'style', 'other'] as const;
	return (ok as readonly string[]).includes(c) ? (c as any) : 'other';
}

function validSeverity(s: string): Suggestion['severity'] {
	const ok = ['info', 'warn', 'error'] as const;
	return (ok as readonly string[]).includes(s) ? (s as any) : 'info';
}

// Sentence-aware packing with overlap only at sentence boundaries
function sentencePack(
	text: string,
	target: number,
	overlapChars: number
): { start: number; end: number; content: string; prefixLen: number }[] {
    const sentences = sentenceRanges(text);
	const chunks: { start: number; end: number; content: string; prefixLen: number }[] = [];
	let i = 0;
	while (i < sentences.length) {
		let start = sentences[i].start;
		let end = sentences[i].end;
		let j = i + 1;
		while (j < sentences.length && end - start < target) {
			end = sentences[j].end;
			j++;
		}
		const prefixStart = Math.max(0, start - overlapChars);
		const prefixLen = start - prefixStart;
		const content = text.slice(prefixStart, end);
		chunks.push({ start, end, content, prefixLen });
		i = j;
	}
	return chunks.length ? chunks : [{ start: 0, end: text.length, content: text, prefixLen: 0 }];
}

// Prose-aware sentence packing: restrict to provided prose ranges
function proseSentencePack(
    text: string,
    ranges: { start: number; end: number }[],
    target: number,
    overlapChars: number
): { start: number; end: number; content: string; prefixLen: number }[] {
    const chunks: { start: number; end: number; content: string; prefixLen: number }[] = [];
    for (const r of ranges) {
        const ps = Math.max(0, Math.min(r.start, text.length));
        const pe = Math.max(ps, Math.min(r.end, text.length));
        if (pe <= ps) continue;
        // sentence ranges relative to the prose window, then shift to absolute
        const rel = sentenceRanges(text.slice(ps, pe)).map(sr => ({ start: sr.start + ps, end: sr.end + ps }));
        if (!rel.length) continue;
        let i = 0;
        while (i < rel.length) {
            let start = rel[i].start;
            let end = rel[i].end;
            let j = i + 1;
            while (j < rel.length && end - start < target) {
                end = rel[j].end;
                j++;
            }
            const prefixStart = Math.max(ps, start - overlapChars);
            const prefixLen = start - prefixStart;
            const content = text.slice(prefixStart, end);
            chunks.push({ start, end, content, prefixLen });
            i = j;
        }
    }
    return chunks.length ? chunks : [{ start: 0, end: text.length, content: text, prefixLen: 0 }];
}

function buildPromptWithPrefix(chunk: string, prefixLen: number): string {
    // Keep guidance concise and rely on responseSchema for structure.
    return `Analyze ONLY the text block. Return JSON matching the provided schema.
Policy:
- Do not edit code (backticks/fenced), HTML, tables, URLs, or markdown link targets.
- Focus on correctness (grammar, punctuation, spelling). Avoid broad rewrites. Preserve voice.
- Style is allowed but must be minimal and clearly helpful. Output style only if:
  • diffKind ∈ {whitespace, punctuation, case} OR
  • your justification shows a correctness gain (not taste) and the edit is small.
- For every item include: original (exact substring), and short context anchors: before (2–5 chars) and after (2–5 chars) when available.
- Prefer small, local fixes over rephrasing. Limit to 30 items.
- The first ${prefixLen} chars are context (overlap). Ranges must start >= ${prefixLen}.

Examples:
{"title":"Spelling","category":"spelling","severity":"warn","range":{"start":10,"end":18},"original":"recieve","before":" to ","after":" the ","replacement":"receive","confidence":0.92}
{"title":"Add space after punctuation","category":"spacing","severity":"info","range":{"start":4,"end":6},"original":",w","before":"Hello","after":"orld","replacement":", w","confidence":0.8,"diffKind":"whitespace"}
{"title":"Sentence case","category":"style","severity":"info","range":{"start":40,"end":41},"original":"t","replacement":"T","confidence":0.85,"diffKind":"case","justification":"Capitalize sentence start"}

BLOCK START\n${chunk}\nBLOCK END`;
}

function normalizeAndDedupe(items: Suggestion[], fullText: string, dbg?: any): Suggestion[] {
    const textLen = fullText.length;
    const startTotal = items.length;
    // Basic sanitize
    const arr = items
        .map((s) => s.range.end < s.range.start ? { ...s, range: { start: s.range.end, end: s.range.start } } : s)
        .filter((s) => s.range.start >= 0 && s.range.end <= textLen);

    const norm = (x?: string) => (x ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

    // Sort so locals come first, then by start
    const sorted = arr.sort((a, b) => {
        if (a.source !== b.source) return a.source === 'local' ? -1 : 1;
        return a.range.start - b.range.start;
    });

    const baseMinConf = 0.55;
    const near = 8; // characters threshold to consider as boundary duplicate
    const quotas: Record<string, number> = { style: Math.min(STYLE_QUOTA, 9999), other: ENABLE_OTHER ? 2 : 0 };
    const counts: Record<string, number> = {};
    const prelim: Suggestion[] = [];
    let contentDrops = 0;
    let droppedByCategory = 0;
    let spacingLetterDrops = 0;
    for (const s of sorted) {
        // category gating (hard off switches)
        if (s.category === 'style' && !ENABLE_STYLE) { droppedByCategory++; continue; }
        if (s.category === 'other' && !ENABLE_OTHER) { droppedByCategory++; continue; }
        const minConf = s.category === 'other' ? policy.minConfidence.other : baseMinConf;
        if ((s.confidence ?? 1) < minConf) continue;
        // drop if overlaps an already kept suggestion (prefer earlier -> locals first)
        if (prelim.some(o => s.range.start < o.range.end && s.range.end > o.range.start)) continue;
        // drop if near-duplicate of same content within +/- near chars
        const skey = `${norm(s.original)}|${norm(s.replacement)}|${s.title}`;
        const dup = prelim.find(o => `${norm(o.original)}|${norm(o.replacement)}|${o.title}` === skey && Math.abs(o.range.start - s.range.start) <= near);
        if (dup) { contentDrops++; continue; }
        // spacing edits must not add letters
        if (s.category === 'spacing' && /\p{L}/u.test(s.replacement ?? '')) { spacingLetterDrops++; continue; }
        const cap = quotas[s.category] ?? Infinity;
        counts[s.category] = (counts[s.category] ?? 0) + 1;
        if (counts[s.category] > cap) continue;
        prelim.push(s);
    }

    // Style gating: minimality + boundary + density budgets
    const nonStyle = prelim.filter(s => s.category !== 'style');
    const styleCand = prelim.filter(s => s.category === 'style');

    const correctnessCount = nonStyle.filter(s => s.category === 'spacing' || s.category === 'punctuation' || s.category === 'spelling').length;
    const budgets = styleBudgets(fullText, correctnessCount);
    const paragraphs = computeParagraphs(fullText);
    const styleKept: Suggestion[] = [];
    const perParaCounts = new Map<number, { style: number; correctness: number }>();
    for (let i = 0; i < paragraphs.length; i++) perParaCounts.set(i, { style: 0, correctness: 0 });
    for (const ns of nonStyle) {
        const pi = paragraphIndexOf(ns.range, paragraphs);
        const pc = perParaCounts.get(pi)!; pc.correctness++; perParaCounts.set(pi, pc);
    }
    let droppedByMinimality = 0, droppedByBoundary = 0, droppedByDensity = 0;
    for (const s of styleCand) {
        // higher confidence for style
        if ((s.confidence ?? 1) < policy.minConfidence.style) { droppedByMinimality++; continue; }
        const { ok, reason, changedTokens } = styleMinimalityPass(s, fullText);
        if (!ok) { if (reason === 'boundary') droppedByBoundary++; else droppedByMinimality++; continue; }
        const pi = paragraphIndexOf(s.range, paragraphs);
        const pc = perParaCounts.get(pi)!;
        const cap = pc.correctness > 0 ? policy.paragraphStyleCapIfCorrectnessPresent : Infinity;
        if (pc.correctness > 0 && pc.style >= cap) { droppedByDensity++; continue; }
        if (styleKept.length >= budgets.global) { droppedByDensity++; continue; }
        styleKept.push({ ...s, changedTokens });
        pc.style++; perParaCounts.set(pi, pc);
    }

    const kept = [...nonStyle, ...styleKept].sort((a, b) => a.range.start - b.range.start);
    if (dbg) Object.assign(dbg, {
        startTotal,
        contentNearDrops: contentDrops,
        droppedByCategory,
        spacingLetterDrops,
        afterConfidence: prelim.length,
        afterQuotas: prelim.length,
        styleDroppedByMinimality: droppedByMinimality,
        styleDroppedByBoundary: droppedByBoundary,
        styleDroppedByDensity: droppedByDensity,
        styleKept: styleKept.length,
        globalStyleBudget: budgets.global
    });
    return kept;
}

function reconcileOriginal(
    s: Suggestion,
    original: string | undefined,
    fullText: string
): Suggestion | null {
    if (!original) return s;
    const slice = fullText.slice(s.range.start, s.range.end);
    if (slice === original) return s;
    const aligned = bestAlignOriginalRange(fullText, s.range, original, s.replacement ?? '', s.before, s.after);
    if (!aligned) return null;
    return { ...s, range: aligned };
}

// Sentence segmentation (lightweight). Respects basic punctuation and newlines.
function sentenceRanges(text: string): { start: number; end: number }[] {
    return sentenceRangesIntl(text);
}

function shiftSuggestion(s: Suggestion, delta: number): Suggestion {
    if (!delta) return s;
    return { ...s, range: { start: s.range.start + delta, end: s.range.end + delta } };
}
function shiftSuggestions(arr: Suggestion[], delta: number): Suggestion[] {
    if (!delta) return arr;
    return arr.map((s) => shiftSuggestion(s, delta));
}
function unshiftSuggestions(arr: Suggestion[], delta: number): Suggestion[] {
    if (!delta) return arr;
    return arr.map((s) => ({ ...s, range: { start: s.range.start - delta, end: s.range.end - delta } }));
}

const PROMPT_VERSION = 'v4';

// Compute non-prose/forbidden ranges using a Markdown AST + regex URL fallback
async function computeForbidden(text: string): Promise<{ start: number; end: number }[]> {
    const md = await computeForbiddenMd(text);
    // Already includes URL/link protection; ensure sorted/merged
    return mergeRangesMd(md);
}

function mergeRanges(r: { start: number; end: number }[]): { start: number; end: number }[] {
    if (r.length === 0) return r;
    const a = r.sort((x, y) => x.start - y.start);
    const out: { start: number; end: number }[] = [];
    let cur = { ...a[0] };
    for (let i = 1; i < a.length; i++) {
        const nx = a[i];
        if (nx.start <= cur.end) cur.end = Math.max(cur.end, nx.end);
        else { out.push(cur); cur = { ...nx }; }
    }
    out.push(cur);
    return out;
}

function intersectsForbidden(range: { start: number; end: number }, forb: { start: number; end: number }[]) {
    for (const f of forb) {
        if (range.start < f.end && range.end > f.start) return true;
    }
    return false;
}

function withinRanges(range: { start: number; end: number }, allowed: { start: number; end: number }[]) {
    for (const a of allowed) {
        if (range.start >= a.start && range.end <= a.end) return true;
    }
    return false;
}

// Guardrail: drop clearly bad or noisy edits (e.g., inserting '?' inside a word)
function sanityOk(s: Suggestion, fullText: string): boolean {
    const { start, end } = s.range;
    if (end < start || start < 0 || end > fullText.length) return false;
    // Avoid extreme rewrites
    if (s.replacement.length > 400) return false;
    // Inserting '?' in the middle of a word when original had none (non-punctuation category)
    if ((s.replacement.includes('?') && !(s.original ?? '').includes('?')) && s.category !== 'punctuation') {
        const L = fullText[start - 1] ?? '';
        const R = fullText[end] ?? '';
        const isLetter = (ch: string) => /\p{L}/u.test(ch);
        if (isLetter(L) && isLetter(R)) return false;
    }
    // Spacing fixes must not add letters
    if (s.category === 'spacing' && /\p{L}/u.test(s.replacement)) return false;
    return true;
}

// Simple in-memory cache with TTL + size cap (approx LRU)
const CACHE = new Map<string, { ts: number; value: Suggestion[] }>();
const TTL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_CACHE = Math.max(1, parseInt(process.env.SQUIGGLE_CACHE_MAX || '200', 10));
function setCache(k: string, v: Suggestion[]) {
	if (CACHE.size >= MAX_CACHE) {
		const first = CACHE.keys().next().value as string | undefined;
		if (first) CACHE.delete(first);
	}
	CACHE.set(k, { ts: Date.now(), value: v });
}
function getCache(k: string): Suggestion[] | null {
	const hit = CACHE.get(k);
	if (!hit) return null;
	if (Date.now() - hit.ts > TTL_MS) {
		CACHE.delete(k);
		return null;
	}
	CACHE.delete(k); // refresh order
	CACHE.set(k, hit);
	return hit.value;
}
function hash(s: string): string {
	return crypto.createHash('sha256').update(s).digest('hex');
}

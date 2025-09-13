<script lang="ts">
  import Editor from '$lib/features/grammar/components/Editor.svelte';
  import SuggestionsPanel from '$lib/features/grammar/components/SuggestionsPanel.svelte';
  import ApiKey from '$lib/features/grammar/components/ApiKey.svelte';
  import { textStore, suggestionsStore, selectedSuggestionId } from '$lib/features/grammar/state/grammar.store';
  import { applySuggestion, revertSuggestion, type Suggestion } from '$lib/features/grammar/model/suggestion';
  import { fetchAiSuggestions, fetchAiSuggestionsScoped } from '$lib/features/grammar/services/gemini';

  let loading = $state(false);
  let apiKey = $state('');
  let suggestions = $state<Suggestion[]>([]);
  let selectedId = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);
  let editor: { highlightRange?: (start: number, end: number) => void } | null = null;
  let highlight = $state<{ start: number; end: number } | null>(null);
  let lastAnalyzedText = '';

  // Debounced auto-analyze while typing
  let analyzeTimer: any = null;
  function scheduleAnalyze() { clearTimeout(analyzeTimer); analyzeTimer = setTimeout(() => analyze(), 500); }
  function cancelAnalyze() { clearTimeout(analyzeTimer); analyzeTimer = null; }
  let suppressAnalyze = false;

  $effect.root(() => {
    const un2 = suggestionsStore.subscribe((v) => (suggestions = v));
    const un3 = selectedSuggestionId.subscribe((v) => (selectedId = v));
    const unText = textStore.subscribe(() => { if (!suppressAnalyze) scheduleAnalyze(); });
    // kick once on mount
    scheduleAnalyze();
    return () => { un2(); un3(); unText(); };
  });

  function setApiKey(v: string) { apiKey = v; }

  function findChangeSpan(a: string, b: string): { start: number; endA: number; endB: number } | null {
    if (a === b) return null;
    let i = 0; const aLen = a.length, bLen = b.length; const minLen = Math.min(aLen, bLen);
    while (i < minLen && a[i] === b[i]) i++;
    let j = 0; while (j < (minLen - i) && a[aLen - 1 - j] === b[bLen - 1 - j]) j++;
    return { start: i, endA: aLen - j, endB: bLen - j };
  }

  async function analyze() {
    loading = true;
    try {
      errorMsg = null;
      let text = '';
      const unsub = textStore.subscribe((t) => (text = t));
      unsub();
      // Keep existing suggestions; prefer scoped analyze when diff is small
      if (apiKey && text.trim().length) {
        const prev = lastAnalyzedText;
        const diff = prev ? findChangeSpan(prev, text) : null;
        const smallEdit = !!diff && (diff.endB - diff.start) <= 1200;
        try {
          const snap = text;
          if (smallEdit && diff) {
            // Shift existing suggestions after the edit point
            const delta = (diff.endB - diff.start) - (diff.endA - diff.start);
            const editStart = diff.start;
            const editEndNew = diff.endB;
            suggestionsStore.update((arr) => {
              const shifted = arr.map((x) => {
                if (x.applied) return x;
                if (x.range.start >= editStart) {
                  return { ...x, range: { start: x.range.start + delta, end: x.range.end + delta } };
                }
                return x;
              }).filter((x) => !(x.range.start < editEndNew && x.range.end > editStart)); // drop intersecting items
              return shifted;
            });
            const span = sentenceSpan(snap, editStart, editEndNew);
            if (span) {
              try {
                const aiScoped = await fetchAiSuggestionsScoped(snap, apiKey, span.start, span.end);
                suggestionsStore.update((arr) => merge(arr, aiScoped));
              } catch (err: any) {
                if (err?.name !== 'AbortError') {
                  console.error(err);
                  errorMsg = 'Could not fetch suggestions. Check your API key and try again.';
                }
              }
            }
          } else {
            const ai = await fetchAiSuggestions(snap, apiKey);
            let latest = '';
            const u = textStore.subscribe((t) => (latest = t)); u();
            if (latest === snap) suggestionsStore.set(merge([], ai));
          }
          lastAnalyzedText = text;
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            console.error(err);
            errorMsg = 'Could not fetch suggestions. Check your API key and try again.';
          }
        }
      }
      selectedSuggestionId.set(null);
    } finally {
      loading = false;
    }
  }

  

  function merge(a: Suggestion[], b: Suggestion[]): Suggestion[] {
    const norm = (x?: string) => (x ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const key = (s: Suggestion) => {
      const o = norm(s.original);
      return o ? `${o}|${norm(s.replacement)}|${s.title}` : `${s.range.start}-${s.range.end}-${s.title}-${s.replacement}`;
    };
    const map = new Map<string, Suggestion>();
    for (const s of [...a, ...b]) {
      const k = key(s);
      if (!map.has(k)) map.set(k, s);
    }
    // sort by severity (error>warn>info), then confidence desc, then start
    const sevRank: Record<string, number> = { error: 3, warn: 2, info: 1 } as const as any;
    return Array.from(map.values()).sort((x, y) => {
      const s = (sevRank[y.severity] ?? 0) - (sevRank[x.severity] ?? 0);
      if (s !== 0) return s;
      const c = (y.confidence ?? 0) - (x.confidence ?? 0);
      if (c !== 0) return c;
      return x.range.start - y.range.start;
    });
  }

  function onSelect(id: string) {
    selectedSuggestionId.set(id);
    const s = suggestions.find((x) => x.id === id);
    if (s) {
      highlight = { ...s.range };
      if (editor?.highlightRange) editor.highlightRange(s.range.start, s.range.end);
    }
  }
  async function onUndo(s: Suggestion) {
    let text = '';
    const unsub = textStore.subscribe((t) => (text = t));
    unsub();
    const updated = revertSuggestion(text, s);
    suppressAnalyze = true; cancelAnalyze();
    textStore.set(updated);
    const delta = (s.original?.length ?? 0) - s.replacement.length;
    suggestionsStore.update((arr) => {
      return arr.map((x) => {
        if (x.id === s.id) return { ...x, applied: false };
        if (x.applied) return x;
        if (x.range.start >= s.range.end) {
          return { ...x, range: { start: x.range.start + delta, end: x.range.end + delta } };
        }
        return x;
      });
    });
    highlight = { ...s.range };
    setTimeout(() => { highlight = null; }, 700);
    try {
      const latest = updated;
      const span = sentenceSpan(latest, s.range.start, s.range.end);
      if (apiKey && span) {
        try {
          const ai = await fetchAiSuggestionsScoped(latest, apiKey, span.start, span.end);
          suggestionsStore.update((arr) => merge(arr, ai));
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            console.error(err);
            errorMsg = 'Could not refresh suggestions for this sentence. Check your API key.';
          }
        }
      }
    } catch (err: any) { if (err?.name !== 'AbortError') console.error(err); }
    finally { suppressAnalyze = false; }
  }
  async function onApply(s: Suggestion) {
    let text = '';
    const unsub = textStore.subscribe((t) => (text = t));
    unsub();
    const updated = applySuggestion(text, s);
    suppressAnalyze = true; cancelAnalyze();
    textStore.set(updated);
    const delta = s.replacement.length - (s.range.end - s.range.start);
    suggestionsStore.update((arr) => {
      return arr.map((x) => {
        if (x.id === s.id) return { ...x, applied: true };
        if (x.applied) return x;
        if (x.range.start >= s.range.end) {
          return { ...x, range: { start: x.range.start + delta, end: x.range.end + delta } };
        }
        return x;
      });
    });
    highlight = { ...s.range };
    setTimeout(() => { highlight = null; }, 700);
    // Targeted re-analysis for the containing sentence
    try {
      const latest = updated;
      const span = sentenceSpan(latest, s.range.start, s.range.end);
      if (apiKey && span) {
        try {
          const ai = await fetchAiSuggestionsScoped(latest, apiKey, span.start, span.end);
          suggestionsStore.update((arr) => merge(arr, ai));
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            console.error(err);
            errorMsg = 'Could not refresh suggestions for this sentence. Check your API key.';
          }
        }
      }
    } catch (err: any) { if (err?.name !== 'AbortError') console.error(err); }
    finally {
      // re-enable auto analyze after a short delay (user can trigger manually sooner)
      suppressAnalyze = false;
    }
  }
  async function onApplyAll() {
    let text = '';
    const unsub = textStore.subscribe((t) => (text = t));
    unsub();
    let current = text;
    const list = [...suggestions].filter((s) => !s.applied && s.category !== 'style');
    list.sort((a, b) => a.range.start - b.range.start).forEach((s) => (current = applySuggestion(current, s)));
    suppressAnalyze = true; cancelAnalyze();
    textStore.set(current);
    suggestionsStore.update((arr) => arr.map((x) => x.category === 'style' ? x : ({ ...x, applied: true })));
    selectedSuggestionId.set(null);
    highlight = null;
    // After bulk apply, do a scoped analyze around the last changed region
    try {
      if (apiKey && list.length) {
        const last = list[list.length - 1];
        const span = sentenceSpan(current, last.range.start, last.range.end);
        if (span) {
          try {
            const ai = await fetchAiSuggestionsScoped(current, apiKey, span.start, span.end);
            suggestionsStore.update((arr) => merge(arr, ai));
          } catch (err: any) {
            if (err?.name !== 'AbortError') {
              console.error(err);
              errorMsg = 'Could not refresh suggestions after apply all. Check your API key.';
            }
          }
        }
      }
    } catch (err: any) { if (err?.name !== 'AbortError') console.error(err); }
    finally { suppressAnalyze = false; }
  }

  import { sentenceRanges } from '$lib/features/grammar/util/segmentation';
  function sentenceSpan(text: string, start: number, end: number): { start: number; end: number } | null {
    const ranges = sentenceRanges(text);
    if (!ranges.length) return null;
    const idx = ranges.findIndex(r => r.start <= start && end <= r.end);
    const r = idx >= 0 ? ranges[idx] : ranges.reduce((acc, r) => (Math.abs(((r.start+r.end)/2) - ((start+end)/2)) < Math.abs(((acc.start+acc.end)/2) - ((start+end)/2)) ? r : acc), ranges[0]);
    // add a small context margin
    const s = Math.max(0, r.start - 40);
    const e = Math.min(text.length, r.end + 40);
    return { start: s, end: e };
  }
</script>

<div class="page">
  <div class="container topbar">
    <h1 class="brand">Squiggle</h1>
  </div>

  <div class="container" style="padding-top:.5rem;">
    <ApiKey onChange={setApiKey} />
    <div class="muted" style="padding:.5rem 0 .25rem .25rem; font-size:.85rem;">Squiggle never stores your key on the server; it stays in your browser and is sent only for this call.</div>
  </div>

  <main class="container content">
    <section class="left">
      <Editor bind:this={editor} {highlight} />
    </section>
    <aside class="right">
      <SuggestionsPanel 
        {onSelect}
        onApply={onApply}
        onUndo={onUndo}
        onApplyAll={onApplyAll}
        {selectedId}
        {suggestions}
        {loading}
        errorMessage={errorMsg}
      />
    </aside>
  </main>
</div>

<style>
  .page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .topbar { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding-top:1rem; }
  .content { flex: 1 1 auto; display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; min-height: 0; overflow: hidden; }
  .left, .right { min-height: 0; height: 100%; overflow: hidden; }
  /* cards auto-size via content */
  h1 { color: var(--secondary); }
  .brand { margin:0; font-weight:800; letter-spacing:.005em; font-size: clamp(1.75rem, 5vw, 2.75rem); }
  @media (max-width: 640px) {
    .content { grid-template-columns: 1fr; }
  }
</style>

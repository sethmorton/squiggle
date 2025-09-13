<script lang="ts">
  import type { Suggestion } from '../model/suggestion';
  import SuggestionItem from './SuggestionItem.svelte';

  let { suggestions, selectedId, onSelect, onApply, onUndo, onApplyAll, loading = false, errorMessage = null }: {
    suggestions: Suggestion[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onApply: (s: Suggestion) => void;
    onUndo: (s: Suggestion) => void;
    onApplyAll: () => void;
    loading?: boolean;
    errorMessage?: string | null;
  } = $props();
  const corrections = $derived(suggestions.filter((s) => s.category !== 'style'));
  const style = $derived(suggestions.filter((s) => s.category === 'style'));
  const allAppliedCorrections = $derived(corrections.length > 0 && corrections.every((s) => !!s.applied));
  let showStyle = $state(false);
</script>

<section class="panel card">
  <header>
    <h3>Suggestions</h3>
    <div class="muted">{suggestions.length} total</div>
  </header>
  {#if errorMessage}
    <div class="alert">
      {errorMessage}
    </div>
  {/if}
  <div class="actions">
    <button class="btn ghost" onclick={onApplyAll} disabled={loading || corrections.length === 0 || allAppliedCorrections}>Apply all corrections</button>
  </div>
  <div class="list" aria-live="polite" aria-busy={loading}>
    {#if loading}
      <div class="loading">
        <div class="spinner" aria-hidden="true"></div>
        Analyzing…
      </div>
      <div class="skeletons">
        {#each Array(3) as _, i}
          <div class="skeleton" style={`animation-delay: ${i * 80}ms`}></div>
        {/each}
      </div>
    {:else if suggestions.length === 0}
      <div class="empty muted">No issues found. Nice work.</div>
    {:else}
      <div class="section">
        <div class="section-header">
          <h4>Corrections</h4>
          <div class="muted">{corrections.length}</div>
        </div>
        {#each corrections as s, i (s.id)}
          <div class="anim" style={`--i: ${i}` }>
            <SuggestionItem s={s} selected={s.id === selectedId} onSelect={onSelect} onApply={onApply} onUndo={onUndo} />
          </div>
        {/each}
        {#if corrections.length === 0}
          <div class="muted" style="padding:.75rem 0;">No corrections.</div>
        {/if}
      </div>
      <div class="section">
        <div class="section-header" role="button" tabindex="0" onclick={() => showStyle = !showStyle} onkeydown={(e)=>{ if (e.key==='Enter'||e.key===' ') showStyle=!showStyle; }}>
          <h4>Style advice</h4>
          <div class="muted">{style.length} {showStyle ? '(hide)' : '(show)'}</div>
        </div>
        {#if showStyle}
          {#each style as s, i (s.id)}
            <div class="anim" style={`--i: ${i}` }>
              <SuggestionItem s={s} selected={s.id === selectedId} onSelect={onSelect} onApply={onApply} onUndo={onUndo} />
            </div>
          {/each}
          {#if style.length === 0}
            <div class="muted" style="padding:.75rem 0;">No style advice.</div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
  
</section>
<style>
  .panel { display:flex; flex-direction: column; height: 100%; }
  .alert { margin: 0 .75rem .5rem .75rem; padding: .5rem .6rem; border: 1px solid color-mix(in oklab, red 30%, var(--border) 70%); background: color-mix(in oklab, red 8%, white 92%); color: oklch(0.5 0.22 28); border-radius: var(--radius); font-weight: 600; }
  header { display:flex; align-items: baseline; justify-content: space-between; padding: .75rem .75rem .25rem .75rem; }
  h3 { margin: 0; font-weight: 700; letter-spacing: .01em; }
  .actions { padding: 0 .75rem .5rem .75rem; }
  .list { display: grid; gap:.5rem; padding:.5rem .75rem .75rem .75rem; overflow:auto; }
  .empty { padding: 1.25rem; text-align: center; }
  .btn.ghost { border-color: var(--border); }
  .loading { display:flex; align-items:center; gap:.6rem; padding:.75rem; color: var(--secondary); font-weight:600; }
  .spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid color-mix(in oklab, var(--primary) 60%, white 30%); border-top-color: transparent; animation: spin .8s linear infinite; }
  .skeletons { display:grid; gap:.5rem; padding:.25rem .75rem .75rem .75rem; }
  .skeleton { height: 64px; border-radius: var(--radius); background: linear-gradient(90deg, color-mix(in oklab, var(--muted) 70%, white 10%) 25%, var(--muted) 50%, color-mix(in oklab, var(--muted) 70%, white 10%) 75%); background-size: 200% 100%; animation: shimmer 1.1s ease-in-out infinite; }
  .anim { opacity: 0; transform: translateY(6px); animation: fadeUp .26s ease-out both; animation-delay: calc(var(--i) * 70ms); }
  .section { border-top: 1px dashed var(--border); padding-top: .5rem; }
  .section-header { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.25rem 0; cursor: pointer; }
  .section-header h4 { margin: 0; font-weight: 700; letter-spacing: .01em; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(6px);} to { opacity:1; transform: translateY(0);} }
  
</style>

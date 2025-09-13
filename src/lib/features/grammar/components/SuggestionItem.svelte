<script lang="ts">
  import type { Suggestion } from '../model/suggestion';
  let { s, selected, onSelect, onApply, onUndo }: {
    s: Suggestion;
    selected: boolean;
    onSelect: (id: string) => void;
    onApply: (s: Suggestion) => void;
    onUndo: (s: Suggestion) => void;
  } = $props();
</script>

<div role="button" tabindex="0" class:selected class:applied={!!s.applied} class="tile" onclick={() => onSelect(s.id)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(s.id); }}>
  <header>
    <span class="tag {s.category}">{s.category}</span>
    <h4>{s.title}</h4>
  </header>
  {#if selected}
    {#if s.message}<p class="muted">{s.message}</p>{/if}
    {#if !s.applied}
      <button class="btn primary" onclick={(e) => { e.stopPropagation(); onApply(s); }}>Apply fix</button>
    {:else}
      <button class="btn primary" onclick={(e) => { e.stopPropagation(); onUndo(s); }}>Undo</button>
    {/if}
  {/if}
</div>

<style>
  .tile { text-align: left; border:1px solid var(--border); border-radius: var(--radius); padding:.75rem; background: var(--card); cursor: pointer; width: 100%; position: relative; }
  .tile:hover { outline: 2px solid color-mix(in oklab, var(--primary) 50%, white 60%); }
  .tile.selected { outline: 2px solid var(--primary); }
  header { display: flex; align-items:center; gap:.5rem; margin-bottom:.25rem; }
  h4 { margin: 0; font-weight: 600; letter-spacing: .01em; }
  .tag { font-size: .7rem; padding:.2rem .4rem; border-radius: 999px; border:1px solid var(--border); background: var(--accent); color: var(--accent-foreground); text-transform: uppercase; }
  .tag.spacing { background: oklch(0.96 0.01 240); }
  .tag.punctuation { background: oklch(0.94 0.03 250); }
  .tag.spelling { background: oklch(0.9 0.05 160); }
  .tag.style { background: oklch(0.93 0.02 210); }
  .tile.applied { opacity: .6; }
  .tile.applied h4, .tile.applied p { text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: color-mix(in oklab, var(--secondary) 40%, var(--border) 60%); }
</style>

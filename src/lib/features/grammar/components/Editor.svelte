<script lang="ts">
  import { textStore } from '../state/grammar.store';
  let text = $state('');
  let textareaEl: HTMLTextAreaElement | null = null;
  let overlayEl: HTMLDivElement | null = null;
  let overlayContentEl: HTMLDivElement | null = null;
  let measureEl: HTMLDivElement | null = null;
  let { highlight }: { highlight?: { start: number; end: number } | null } = $props();

  function escapeHtml(s: string) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderOverlay() {
    if (!overlayContentEl) return;
    const h = highlight ?? null;
    if (!h) {
      overlayContentEl.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
      return;
    }
    const s = Math.max(0, Math.min(h.start, text.length));
    const e = Math.max(s, Math.min(h.end, text.length));
    const before = escapeHtml(text.slice(0, s));
    const mid = escapeHtml(text.slice(s, e));
    const after = escapeHtml(text.slice(e));
    overlayContentEl.innerHTML = `${before}<span class="hl">${mid || '\u200b'}</span>${after}`.replace(/\n/g, '<br>');
  }

  $effect.root(() => {
    const unsub = textStore.subscribe((v) => (text = v));
    return () => unsub();
  });

  function onInput(e: Event) {
    textStore.set((e.target as HTMLTextAreaElement).value);
  }

  // Expose a method so parent can highlight the selected suggestion's range
  export function highlightRange(start: number, end: number) {
    if (!textareaEl) return;
    highlight = { start, end };
    textareaEl.focus();
    requestAnimationFrame(() => {
      try { scrollToIndex(start); } catch {}
      renderOverlay();
    });
  }

  // When highlight prop changes, ensure selection + scroll
  $effect(() => { text; highlight; renderOverlay(); });

  function syncOverlayScroll() {
    if (!textareaEl || !overlayContentEl) return;
    const x = textareaEl.scrollLeft;
    const y = textareaEl.scrollTop;
    overlayContentEl.style.transform = `translate(${-x}px, ${-y}px)`;
  }

  function scrollToIndex(index: number) {
    if (!textareaEl || !measureEl) return;
    const ta = textareaEl;
    const cs = getComputedStyle(ta);
    measureEl.style.width = ta.clientWidth + 'px';
    measureEl.style.font = cs.font;
    measureEl.style.letterSpacing = cs.letterSpacing;
    measureEl.style.whiteSpace = 'pre-wrap';
    measureEl.style.lineHeight = cs.lineHeight;
    measureEl.style.padding = cs.padding;
    // Build content up to index and a marker
    measureEl.textContent = '';
    const before = document.createTextNode(text.slice(0, index));
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    measureEl.appendChild(before);
    measureEl.appendChild(marker);
    const top = marker.offsetTop;
    const target = Math.max(0, top - ta.clientHeight * 0.3);
    ta.scrollTop = target;
    syncOverlayScroll();
  }
</script>

<div class="editor card">
  <div class="stack">
    <div bind:this={overlayEl} class="overlay" aria-hidden="true"><div bind:this={overlayContentEl} class="overlay-content"></div></div>
    <textarea bind:this={textareaEl} value={text} oninput={(e) => { onInput(e); renderOverlay(); }} onscroll={syncOverlayScroll} placeholder="AI-based grammar checker. Paste or start typing..."></textarea>
  </div>
  <div bind:this={measureEl} class="measure" aria-hidden="true"></div>
</div>

<style>
  .editor { height: 100%; display: flex; }
  .stack { position: relative; flex: 1; }
  .overlay {
    position: absolute; inset: 0; overflow: hidden;
    padding: 1rem 1.25rem; white-space: pre-wrap; word-wrap: break-word;
    font: 500 1rem/1.6 var(--font-serif);
    color: transparent; /* only show highlight background under textarea text */
    pointer-events: none; z-index: 0;
  }
  .overlay-content { will-change: transform; }
  :global(.overlay .hl) {
    background: #fff3a3; /* soft yellow */
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px color-mix(in oklab, #fff3a3 60%, black 10%);
  }
  textarea {
    resize: none;
    width: 100%;
    height: 100%;
    font: 500 1rem/1.6 var(--font-serif);
    padding: 1rem 1.25rem;
    border: none;
    outline: none;
    background: transparent;
    overflow: auto; /* inner scroll */
    position: relative; z-index: 1;
  }
  .measure { position: absolute; visibility: hidden; pointer-events: none; left: -9999px; top: 0; white-space: pre-wrap; }
</style>

<script lang="ts">
  let { href = 'https://github.com/sethmorton/squiggle', title = 'GitHub: sethmorton' } = $props();
</script>

<a
  class="gh-link"
  href={href}
  target="_blank"
  rel="noopener noreferrer"
  aria-label={title}
  title={title}
>
  <!-- GitHub mark -->
  <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path fill="currentColor" fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38C13.71 14.53 16 11.54 16 8c0-4.42-3.58-8-8-8Z"/>
  </svg>
</a>

<style>
  .gh-link {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 50;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    background: var(--popover);
    border: 1px solid var(--border);
    border-radius: 9999px;
    box-shadow: var(--shadow-xs);
    text-decoration: none;
    opacity: 0.95;
    transition: color 160ms ease, opacity 160ms ease, transform 160ms ease;
  }
  .gh-link:hover {
    color: var(--foreground);
    opacity: 1;
    transform: translateY(-1px);
  }
  /* Mobile-friendly placement and target size */
  @media (max-width: 640px) {
    .gh-link {
      top: auto;
      right: 12px;
      bottom: 12px;
      width: 44px;
      height: 44px;
    }
    .gh-link svg { width: 24px; height: 24px; }
  }
  /* Respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .gh-link { transition: none; }
  }
</style>

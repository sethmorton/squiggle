<script lang="ts">
  const KEY = 'gemini_api_key';
  let { onChange }: { onChange?: (key: string) => void } = $props();
  let value = $state('');
  let show = $state(false);
  let remember = $state(false);

  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        value = saved;
        remember = true;
        onChange?.(value);
      }
    }
  });

  function persist() {
    if (typeof localStorage === 'undefined') return;
    if (remember) {
      if (value) localStorage.setItem(KEY, value);
      else localStorage.removeItem(KEY);
    } else {
      localStorage.removeItem(KEY);
    }
  }

  function save() {
    persist();
    onChange?.(value);
  }
</script>

<form class="card" onsubmit={(e)=>e.preventDefault()} style="padding: .75rem; display:flex; gap:.5rem; align-items:center; flex-wrap: wrap;">
  <label for="api" class="muted" style="min-width:7rem;">Gemini API Key</label>
  <input id="api" class="input" bind:value oninput={save} type={show ? 'text' : 'password'} placeholder="paste key" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck={false} style="flex:1; min-width: 260px; padding:.5rem .6rem;" />
  <button class="btn ghost" type="button" onclick={() => (show = !show)} aria-label="Toggle visibility">{show ? 'Hide' : 'Show'}</button>
  <label class="muted" style="display:flex; align-items:center; gap:.35rem; user-select:none;">
    <input type="checkbox" bind:checked={remember} onchange={() => { persist(); }} /> Remember on this device
  </label>
</form>
<style>
  input.input { font-family: var(--font-mono); }
  .muted { font-size: .9rem; }
  button.btn { white-space: nowrap; }
</style>

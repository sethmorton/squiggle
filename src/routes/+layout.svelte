<script lang="ts">
  import '../app.css';
  import GitHubLink from '$lib/components/GitHubLink.svelte';

	let { children } = $props();
</script>

<!-- Favicon is defined in app.html using %sveltekit.assets%/favicon.svg -->

<GitHubLink href="https://github.com/sethmorton" />

{@render children?.()}

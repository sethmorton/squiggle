<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
  import GitHubLink from '$lib/components/GitHubLink.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<GitHubLink href="https://github.com/sethmorton" />

{@render children?.()}

<script lang="ts">
  import '../app.css';
  import GitHubLink from '$lib/components/GitHubLink.svelte';

	let { children } = $props();
</script>

<!-- Favicon is defined in app.html using %sveltekit.assets%/favicon.svg -->

<svelte:head>
  <title>Squiggle | Tiny grammar help</title>
  <meta name="application-name" content="Squiggle" />
  <meta name="description" content="Tiny, friendly grammar help you run yourself. Bring your own Google AI key. Minimal, correct suggestions for prose and Markdown." />
  <meta name="theme-color" content="#ffffff" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="Squiggle" />
  <meta property="og:description" content="Tiny, friendly grammar help you run yourself. Bring your own Google AI key." />
  <meta property="og:url" content="https://squiggle.sethmorton.com/" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Squiggle" />
  <meta name="twitter:description" content="Tiny, friendly grammar help you run yourself." />

  <link rel="canonical" href="https://squiggle.sethmorton.com/" />
</svelte:head>

<GitHubLink href="https://github.com/sethmorton" />

{@render children?.()}

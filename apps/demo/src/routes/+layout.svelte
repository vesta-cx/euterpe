<script lang="ts">
	import { Toaster } from "$/components/ui/sonner/index.js";
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Toaster />

{@render children?.()}

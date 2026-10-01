<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { site } from '$lib/site';
	import { page } from '$app/state';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Copy from '@lucide/svelte/icons/copy';
	import Save from '@lucide/svelte/icons/save';
	import PlayableTab from '$lib/components/PlayableTab.svelte';
	import { tabStore } from '$lib/stores/tabs.svelte';
	import { renderTab } from '$lib/tab/render';
	import { decodeSharedTab, payloadFromHash } from '$lib/tab/share';
	import { getTuning } from '$lib/tab/tuning';
	import { toaster } from '$lib/toaster';

	const shared = $derived(decodeSharedTab(payloadFromHash(page.url.hash)));
	const tuning = $derived(getTuning(shared?.tuningId));
	const result = $derived(renderTab(shared?.source ?? '', tuning));

	function save() {
		if (!shared) return;
		const tab = tabStore.create(shared);
		toaster.success({ title: 'Saved to your tabs' });
		goto(resolve('/tab/[id]', { id: tab.id }));
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(result.text);
			toaster.success({ title: 'Tab copied to clipboard' });
		} catch {
			toaster.error({ title: 'Could not access the clipboard' });
		}
	}
</script>

<svelte:head>
	<meta name="robots" content="noindex, follow" />
	<title
		>{shared
			? `${shared.title || 'Shared tab'} · ${site.name}`
			: `Shared tab · ${site.name}`}</title
	>
</svelte:head>

{#if !shared}
	<section class="space-y-4 card preset-tonal-surface p-10 text-center">
		<h1 class="h3">Nothing to see here</h1>
		<p class="opacity-70">This share link is incomplete or was damaged on its way here.</p>
		<a class="btn preset-filled-primary-500" href={resolve('/')}>Back to your tabs</a>
	</section>
{:else}
	<div class="space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<a href={resolve('/')} class="btn hover:preset-tonal">
				<ArrowLeft class="size-4" /> All tabs
			</a>
			<div class="flex flex-wrap gap-2">
				<button type="button" class="btn preset-filled-primary-500" onclick={save}>
					<Save class="size-4" /> Save to my tabs
				</button>
				<button type="button" class="btn preset-tonal" onclick={copy} disabled={!result.text}>
					<Copy class="size-4" /> Copy tab
				</button>
			</div>
		</div>

		<header class="space-y-1">
			<h1 class="h2">{shared.title || 'Untitled tab'}</h1>
			<p class="opacity-70">
				{shared.artist || 'Unknown artist'} · {tuning.label}
			</p>
			<p class="text-sm opacity-60">
				Shared with you. Save it to keep your own editable copy in this browser.
			</p>
		</header>

		<PlayableTab
			layout={result.layout}
			{tuning}
			placeholder="This shared tab is empty."
			class="min-h-64"
		/>
	</div>
{/if}

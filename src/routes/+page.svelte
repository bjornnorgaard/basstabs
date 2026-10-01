<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Copy from '@lucide/svelte/icons/copy';
	import FileMusic from '@lucide/svelte/icons/file-music';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Trash from '@lucide/svelte/icons/trash';
	import TabPreview from '$lib/components/TabPreview.svelte';
	import { tabStore, type BassTab } from '$lib/stores/tabs.svelte';
	import { renderTab } from '$lib/tab/render';
	import { getTuning } from '$lib/tab/tuning';

	const EXAMPLE_SOURCE = 'E0 0 A2 2 | E0 0 3 A2 |';

	let query = $state('');

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return tabStore.sorted;
		return tabStore.sorted.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q));
	});

	function preview(tab: BassTab) {
		// Only the first row keeps the cards compact.
		return renderTab(tab.source, getTuning(tab.tuningId)).text.split('\n\n')[0];
	}

	function open(id: string) {
		goto(resolve('/tab/[id]', { id }));
	}

	function create(source = '', title?: string) {
		open(tabStore.create({ source, ...(title ? { title } : {}) }).id);
	}

	function duplicate(id: string) {
		const copy = tabStore.duplicate(id);
		if (copy) open(copy.id);
	}

	function remove(tab: BassTab) {
		if (confirm(`Delete "${tab.title}"? This cannot be undone.`)) tabStore.remove(tab.id);
	}

	const dateFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
</script>

<div class="space-y-6">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="h2">Your tabs</h1>
			<p class="opacity-70">Write bass lines in shorthand, get classic text tabs.</p>
		</div>
		{#if tabStore.tabs.length > 0}
			<div class="field-group w-full grid-cols-[auto_1fr] sm:w-72">
				<span class="label preset-tonal"><Search class="size-4" /></span>
				<input
					class="input"
					type="search"
					aria-label="Search tabs"
					placeholder="Search title or artist…"
					bind:value={query}
				/>
			</div>
		{/if}
	</header>

	{#if tabStore.tabs.length === 0}
		<section class="flex flex-col items-center gap-4 card preset-tonal-surface p-10 text-center">
			<FileMusic class="size-12 text-primary-500" />
			<h2 class="h4">No tabs yet</h2>
			<p class="max-w-md opacity-75">
				Type something like <code>{EXAMPLE_SOURCE}</code> and watch it turn into a bass tab.
			</p>
			<div class="flex flex-wrap justify-center gap-2">
				<button type="button" class="btn preset-filled-primary-500" onclick={() => create()}>
					<Plus class="size-4" /> New tab
				</button>
				<button
					type="button"
					class="btn preset-outlined-primary-500"
					onclick={() => create(EXAMPLE_SOURCE, 'Example riff')}
				>
					Start from example
				</button>
			</div>
		</section>
	{:else if filtered.length === 0}
		<p class="opacity-70">No tabs match “{query}”.</p>
	{:else}
		<ul class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each filtered as tab (tab.id)}
				<li
					class="flex flex-col gap-3 card preset-outlined-surface-200-800 p-4 hover:preset-outlined-primary-500"
				>
					<a href={resolve('/tab/[id]', { id: tab.id })} class="block space-y-1">
						<h2 class="truncate h5">{tab.title || 'Untitled tab'}</h2>
						<p class="truncate text-sm opacity-70">
							{tab.artist || 'Unknown artist'} · {getTuning(tab.tuningId).label}
						</p>
					</a>
					<a href={resolve('/tab/[id]', { id: tab.id })} tabindex="-1" class="block">
						<TabPreview text={preview(tab)} placeholder="Empty tab" class="max-h-40 text-xs" />
					</a>
					<footer class="mt-auto flex items-center justify-between text-xs">
						<span class="opacity-60">Edited {dateFormat.format(tab.updatedAt)}</span>
						<span class="flex gap-1">
							<button
								type="button"
								class="btn-icon btn-icon-sm hover:preset-tonal"
								title="Duplicate"
								aria-label="Duplicate {tab.title}"
								onclick={() => duplicate(tab.id)}
							>
								<Copy class="size-4" />
							</button>
							<button
								type="button"
								class="btn-icon btn-icon-sm hover:preset-tonal-error"
								title="Delete"
								aria-label="Delete {tab.title}"
								onclick={() => remove(tab)}
							>
								<Trash class="size-4" />
							</button>
						</span>
					</footer>
				</li>
			{/each}
		</ul>
	{/if}
</div>

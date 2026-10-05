<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Copy from '@lucide/svelte/icons/copy';
	import FileMusic from '@lucide/svelte/icons/file-music';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Trash from '@lucide/svelte/icons/trash';
	import Cloud from '@lucide/svelte/icons/cloud';
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import TabPreview from '$lib/components/TabPreview.svelte';
	import { tabStore, type BassTab } from '$lib/stores/tabs.svelte';
	import { EXAMPLE_SOURCE } from '$lib/tab/example';
	import { getTuning } from '$lib/tab/tuning';
	import { firstSystemPreview } from '$lib/tab/preview';
	import { cloudStore } from '$lib/stores/cloud.svelte';
	import { errorMessage } from '$lib/cloud/model';
	import { toaster } from '$lib/toaster';

	let query = $state('');

	const tabs = $derived(
		[...tabStore.tabs.filter((tab) => !cloudStore.get(tab.id)), ...cloudStore.tabs].sort(
			(a, b) => b.updatedAt - a.updatedAt
		)
	);
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return tabs;
		return tabs.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q));
	});

	function open(id: string) {
		goto(resolve('/tab/[id]', { id }));
	}

	function create(source = EXAMPLE_SOURCE, title?: string) {
		open(cloudStore.create({ source, ...(title ? { title } : {}) }).id);
	}

	function duplicate(id: string) {
		const original = cloudStore.get(id) ?? tabStore.get(id);
		const copy = original
			? cloudStore.create({
					title: `${original.title} (copy)`,
					artist: original.artist,
					tuningId: original.tuningId,
					source: original.source
				})
			: undefined;
		if (copy) open(copy.id);
	}

	async function remove(tab: BassTab) {
		if (!confirm(`Delete "${tab.title}"? This cannot be undone.`)) return;
		try {
			if (cloudStore.get(tab.id)) await cloudStore.remove(tab.id);
			else tabStore.remove(tab.id);
		} catch (error) {
			toaster.error({ title: 'Could not delete tab', description: errorMessage(error) });
		}
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
		{#if tabs.length > 0}
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

	{#if cloudStore.user}
		<section class="space-y-3" aria-label="Cloud connection">
			{#if cloudStore.loading}
				<p role="status">Loading cloud tabs...</p>
			{:else if cloudStore.connectionFailed}
				<p role="alert">
					Cloud tabs could not be loaded. Your cloud library is unavailable, not necessarily empty.
				</p>
				<button class="btn preset-tonal btn-sm" onclick={() => cloudStore.connect()}
					>Reconnect cloud</button
				>
			{:else if cloudStore.offline || cloudStore.pendingSync}
				<p role="status">
					{cloudStore.pendingSync
						? 'Offline — changes will sync when the connection returns.'
						: 'Offline — showing cached cloud tabs.'}
				</p>
			{/if}
		</section>
	{/if}
	<p class="text-sm opacity-70">
		{#if cloudStore.user}
			Tabs save to your account automatically. Set a tab's save location to “Browser only” to opt
			out. Browser-only tabs stay on this device, including when signed out.
		{:else}
			Tabs stay in this browser without an account. Sign in to save them to the cloud automatically,
			unless you choose “Browser only” as the save location.
		{/if}
	</p>

	{#if tabs.length === 0 && !cloudStore.loading && !cloudStore.connectionFailed}
		<section class="flex flex-col items-center gap-4 card preset-tonal-surface p-10 text-center">
			<FileMusic class="size-12 text-primary-500" />
			<h2 class="h4">No tabs yet</h2>
			<p class="max-w-md opacity-75">
				New tabs start with an editable example covering the supported shorthand syntax.
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
	{:else if filtered.length === 0 && tabs.length > 0}
		<p class="opacity-70">No tabs match “{query}”.</p>
	{:else}
		<ul class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each filtered as tab (tab.id)}
				<li
					class="flex min-w-0 flex-col gap-3 card preset-outlined-surface-200-800 p-4 hover:preset-outlined-primary-500"
				>
					<a href={resolve('/tab/[id]', { id: tab.id })} class="block space-y-1">
						<h2 class="truncate h5">{tab.title || 'Untitled tab'}</h2>
						<p class="truncate text-sm opacity-70">
							{tab.artist || 'Unknown artist'} · {getTuning(tab.tuningId).label}
						</p>
						<span class="inline-flex items-center gap-1 text-xs" role="status">
							{#if cloudStore.get(tab.id)}
								<Cloud class="size-4" />
								{cloudStore.movingToBrowser.includes(tab.id)
									? 'Moving to browser...'
									: cloudStore.saving.includes(tab.id)
										? cloudStore.offline
											? 'Offline — changes will sync'
											: 'Saving to cloud...'
										: cloudStore.dirty.includes(tab.id)
											? cloudStore.offline
												? 'Offline — changes will sync'
												: 'Cloud · Unsaved changes'
											: 'Saved to cloud'}
								· {cloudStore.get(tab.id)?.visibility}
							{:else}
								{#if cloudStore.user && !tab.browserOnly && (!tab.cloudOwnerId || tab.cloudOwnerId === cloudStore.user.uid)}
									<Cloud class="size-4" />
									{cloudStore.saving.includes(tab.id)
										? 'Saving to cloud...'
										: cloudStore.uploadErrors[tab.id]
											? 'Cloud save failed · Browser backup kept'
											: 'Cloud save pending · Browser backup kept'}
								{:else}
									<HardDrive class="size-4" />
									{tab.cloudOwnerId ? 'Pending save for another account' : 'Browser only'}
								{/if}
							{/if}
						</span>
					</a>
					<a href={resolve('/tab/[id]', { id: tab.id })} tabindex="-1" class="block">
						<TabPreview
							{...firstSystemPreview(tab)}
							placeholder="Empty tab"
							class="max-h-40 text-xs"
						/>
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
								disabled={cloudStore.saving.includes(tab.id) ||
									cloudStore.movingToBrowser.includes(tab.id)}
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

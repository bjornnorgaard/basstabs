<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Search from '@lucide/svelte/icons/search';
	import TabPreview from '$lib/components/TabPreview.svelte';
	import { getFirebase, type FirebaseServices } from '$lib/firebase';
	import { readCloudTab, errorMessage, type CloudTab } from '$lib/cloud/model';
	import { filterLoadedPublicTabs } from '$lib/public-library';
	import { site } from '$lib/site';
	import { firstSystemPreview } from '$lib/tab/preview';

	type FirestoreConstraint =
		| ReturnType<FirebaseServices['firestoreSdk']['where']>
		| ReturnType<FirebaseServices['firestoreSdk']['orderBy']>
		| ReturnType<FirebaseServices['firestoreSdk']['limit']>
		| ReturnType<FirebaseServices['firestoreSdk']['startAfter']>;
	type FirestoreCursor = Awaited<
		ReturnType<FirebaseServices['firestoreSdk']['getDocs']>
	>['docs'][number];

	let tabs = $state<CloudTab[]>([]);
	let loading = $state(false);
	let error = $state('');
	let more = $state(true);
	let filter = $state('');
	let cursor: FirestoreCursor | undefined;

	const filteredTabs = $derived(filterLoadedPublicTabs(tabs, filter));
	const skeletonCards = [0, 1, 2, 3, 4, 5];

	async function load() {
		if (loading) return;
		loading = true;
		error = '';
		try {
			const { db, firestoreSdk } = await getFirebase();
			const { collection, getDocs, limit, orderBy, query, startAfter, where } = firestoreSdk;
			const constraints: FirestoreConstraint[] = [
				where('visibility', '==', 'public'),
				orderBy('updatedAt', 'desc'),
				limit(24)
			];
			if (cursor) constraints.push(startAfter(cursor));
			const result = await getDocs(query(collection(db, 'publishedTabs'), ...constraints));
			const next = result.docs.map((d) => readCloudTab(d.id, { ...d.data(), shareId: d.id }));
			tabs.push(...next.filter((t) => !tabs.some((old) => old.id === t.id)));
			cursor = result.docs.at(-1) ?? cursor;
			more = result.size === 24;
		} catch (cause) {
			error =
				(cause as { code?: string })?.code === 'failed-precondition'
					? 'The public library is still being prepared. Please try again in a few minutes.'
					: errorMessage(cause);
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		void load();
	});
</script>

<svelte:head><title>Public tabs · {site.name}</title></svelte:head>

<div class="space-y-6">
	<header>
		<h1 class="h2">Public tabs</h1>
		<p class="opacity-70">Explore tabs shared by their owners. No sign-in required.</p>
	</header>
	{#if error}<p role="alert" class="preset-tonal-error p-4">{error}</p>{/if}
	{#if tabs.length > 0 || filter}
		<section class="space-y-2" aria-labelledby="loaded-tab-filter-label">
			<label id="loaded-tab-filter-label" class="label" for="loaded-tab-filter">
				Filter loaded tabs
			</label>
			<div class="field-group w-full grid-cols-[auto_1fr] sm:w-96">
				<span class="label preset-tonal"><Search class="size-4" /></span>
				<input
					id="loaded-tab-filter"
					class="input"
					type="search"
					aria-describedby="loaded-tab-filter-help"
					placeholder="Filter loaded titles or artists…"
					bind:value={filter}
				/>
			</div>
			<p id="loaded-tab-filter-help" class="text-sm opacity-70">
				{#if filter.trim()}
					Showing {filteredTabs.length} of {tabs.length} loaded public tabs. Load more to bring older
					tabs into this client-side filter.
				{:else if more}
					Showing {tabs.length} loaded public {tabs.length === 1 ? 'tab' : 'tabs'}. Load more to
					browse older public tabs.
				{:else}
					Showing all {tabs.length} loaded public {tabs.length === 1 ? 'tab' : 'tabs'}.
				{/if}
			</p>
		</section>
	{/if}
	{#if loading && tabs.length === 0 && !error}
		<div role="status" class="space-y-3">
			<p class="text-sm opacity-70">Loading public tabs…</p>
			<ul class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
				{#each skeletonCards as skeleton (skeleton)}
					<li class="min-w-0 card preset-outlined-surface-200-800 p-4">
						<div class="animate-pulse space-y-4">
							<div class="h-6 w-3/4 rounded bg-surface-300-700"></div>
							<div class="h-4 w-1/2 rounded bg-surface-300-700"></div>
							<div class="h-7 w-28 rounded bg-surface-300-700"></div>
							<div class="h-36 rounded-container bg-surface-300-700"></div>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{:else if filteredTabs.length > 0}
		<ul class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each filteredTabs as tab (tab.id)}
				{@const preview = firstSystemPreview(tab)}
				<li class="flex min-w-0 flex-col gap-3 card preset-outlined-surface-200-800 p-4">
					<a class="block space-y-2" href={resolve(`/shared?id=${tab.id}`)}>
						<div class="space-y-1">
							<h2 class="h5 break-words">{tab.title || 'Untitled tab'}</h2>
							<p class="text-sm break-words opacity-70">{tab.artist || 'Unknown artist'}</p>
						</div>
						<span
							class="badge inline-flex max-w-full flex-wrap gap-1 preset-tonal-primary text-left"
							title={preview.tuning.label}
						>
							<span>{preview.tuning.strings.length}-string</span>
							<span class="opacity-70">{preview.tuning.strings.join(' ')}</span>
						</span>
					</a>
					<a href={resolve(`/shared?id=${tab.id}`)} tabindex="-1" class="block">
						<TabPreview
							tuning={preview.tuning}
							blocks={preview.blocks}
							placeholder="No preview available"
							class="max-h-40 text-xs"
						/>
					</a>
				</li>
			{/each}
		</ul>
	{:else if !loading && !error && tabs.length === 0}
		<p>No public tabs yet.</p>
	{:else if filter.trim()}
		<p class="opacity-70">
			No loaded public tabs match “{filter}”. {more
				? 'Load more to filter older public tabs too.'
				: 'All public tabs have been loaded.'}
		</p>
	{/if}
	{#if more || error}
		<button class="btn preset-tonal" disabled={loading} onclick={load}
			>{loading
				? 'Loading...'
				: error
					? 'Retry'
					: filter.trim()
						? 'Load more tabs to filter'
						: 'Load more'}</button
		>
	{/if}
</div>

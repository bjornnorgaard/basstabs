<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		collection,
		getDocs,
		limit,
		orderBy,
		query,
		startAfter,
		where,
		type QueryConstraint,
		type QueryDocumentSnapshot
	} from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import { readCloudTab, errorMessage, type CloudTab } from '$lib/cloud/model';
	import { site } from '$lib/site';

	let tabs = $state<CloudTab[]>([]);
	let loading = $state(false);
	let error = $state('');
	let more = $state(true);
	let cursor: QueryDocumentSnapshot | undefined;

	async function load() {
		if (loading) return;
		loading = true;
		error = '';
		try {
			const constraints: QueryConstraint[] = [
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
	<ul class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
		{#each tabs as tab (tab.id)}
			<li class="card preset-outlined-surface-200-800 p-4">
				<a class="block space-y-2" href={resolve(`/shared?id=${tab.id}`)}>
					<h2 class="h5">{tab.title || 'Untitled tab'}</h2>
					<p class="opacity-70">{tab.artist || 'Unknown artist'}</p>
				</a>
			</li>
		{/each}
	</ul>
	{#if !loading && !error && tabs.length === 0}<p>No public tabs yet.</p>{/if}
	{#if more || error}
		<button class="btn preset-tonal" disabled={loading} onclick={load}
			>{loading ? 'Loading...' : error ? 'Retry' : 'Load more'}</button
		>
	{/if}
</div>

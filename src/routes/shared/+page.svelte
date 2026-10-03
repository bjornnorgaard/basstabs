<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { site } from '$lib/site';
	import { page } from '$app/state';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Copy from '@lucide/svelte/icons/copy';
	import Save from '@lucide/svelte/icons/save';
	import PlayableTab from '$lib/components/PlayableTab.svelte';
	import { cloudStore } from '$lib/stores/cloud.svelte';
	import { renderTab } from '$lib/tab/render';
	import { decodeSharedTab, payloadFromHash } from '$lib/tab/share';
	import { getTuning } from '$lib/tab/tuning';
	import { toaster } from '$lib/toaster';
	import { doc, onSnapshot } from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import { readCloudTab, errorMessage } from '$lib/cloud/model';
	import type { SharedTab } from '$lib/tab/share';

	let live = $state<SharedTab | null>(null);
	let loading = $state(false);
	let error = $state('');
	let retry = $state(0);
	const token = $derived(page.url.searchParams.get('id'));
	const shared = $derived(token ? live : decodeSharedTab(payloadFromHash(page.url.hash)));
	$effect(() => {
		const attempt = retry;
		live = null;
		loading = false;
		error = '';
		if (!token) return;
		if (!/^[a-f0-9]{32}$/.test(token)) {
			error = 'This live share link is invalid.';
			return;
		}
		loading = true;
		return onSnapshot(
			doc(db, 'publishedTabs', token),
			(snapshot) => {
				try {
					live = snapshot.exists()
						? readCloudTab(snapshot.id, { ...snapshot.data(), shareId: snapshot.id })
						: null;
					error = snapshot.exists() ? '' : 'This tab was deleted or sharing was revoked.';
				} catch (cause) {
					live = null;
					error = errorMessage(cause);
				}
				loading = false;
			},
			(cause) => {
				live = null;
				loading = false;
				error = `${errorMessage(cause)}${attempt > 0 ? ' Please check the link or try again later.' : ''}`;
			}
		);
	});
	const tuning = $derived(getTuning(shared?.tuningId));
	const result = $derived(renderTab(shared?.source ?? '', tuning));

	function save() {
		if (!shared) return;
		const { title, artist, tuningId, source } = shared;
		const tab = cloudStore.create({ title, artist, tuningId, source });
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
	<meta name="referrer" content="no-referrer" />
	<meta name="robots" content="noindex, follow" />
	<title
		>{shared
			? `${shared.title || 'Shared tab'} · ${site.name}`
			: `Shared tab · ${site.name}`}</title
	>
</svelte:head>

{#if loading}
	<p role="status">Loading shared tab...</p>
{:else if error}
	<section class="space-y-4 card preset-tonal-surface p-10 text-center">
		<h1 class="h3">Shared tab unavailable</h1>
		<p role="alert">{error}</p>
		<button
			class="btn preset-tonal"
			onclick={() => {
				retry += 1;
			}}>Retry</button
		>
		<a class="btn preset-filled-primary-500" href={resolve('/')}>Back to your tabs</a>
	</section>
{:else if !shared}
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
				{token
					? 'Live read-only tab. Saved updates appear here automatically.'
					: 'Snapshot shared with you.'}
				Save it to keep your own independent editable copy.
				{cloudStore.user
					? 'It will save to your cloud account automatically.'
					: 'It stays in this browser until you sign in.'}
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

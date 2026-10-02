<script lang="ts">
	import './layout.css';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { site } from '$lib/site';
	import { AppBar, Toast } from '@skeletonlabs/skeleton-svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Brand from '$lib/components/Brand.svelte';
	import HighlightToggle from '$lib/components/HighlightToggle.svelte';
	import ModeToggle from '$lib/components/ModeToggle.svelte';
	import { tabStore } from '$lib/stores/tabs.svelte';
	import { toaster } from '$lib/toaster';
	import AccountControls from '$lib/components/AccountControls.svelte';
	import { cloudStore } from '$lib/stores/cloud.svelte';

	let { children } = $props();

	function newTab() {
		const tab = tabStore.create();
		goto(resolve('/tab/[id]', { id: tab.id }));
	}
</script>

<svelte:head>
	<link rel="icon" href={site.icon} />
	<title>{site.name}</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<AppBar
		class="sticky top-0 z-10 border-b border-surface-200-800 bg-surface-50-950/80 backdrop-blur"
	>
		<AppBar.Toolbar
			class="mx-auto flex w-full max-w-[96rem] items-center justify-between gap-4 px-4"
		>
			<AppBar.Lead>
				<Brand />
			</AppBar.Lead>
			<AppBar.Trail class="flex flex-wrap items-center justify-end gap-2">
				<a href={resolve('/public')} class="btn preset-tonal btn-sm">Public tabs</a>
				<AccountControls />
				<a
					href={resolve('/sound')}
					class="btn-icon hover:preset-tonal"
					title="Sound design"
					aria-label="Sound design"
				>
					<SlidersHorizontal class="size-5" />
				</a>
				<button type="button" class="btn preset-filled-primary-500" onclick={newTab}>
					<Plus class="size-4" /> New tab
				</button>
				<HighlightToggle />
				<ModeToggle />
			</AppBar.Trail>
		</AppBar.Toolbar>
	</AppBar>

	<main class="mx-auto w-full max-w-[96rem] flex-1 p-4 md:p-6">
		{#if cloudStore.error}
			<div role="alert" class="mb-4 space-y-2 card preset-tonal-error p-4">
				<p>Cloud: {cloudStore.error}</p>
				<p class="text-sm">
					Local tabs still work. Retry saving unsaved cloud changes. Drafts are backed up in this
					browser when browser storage is available.
				</p>
				{#if cloudStore.connectionFailed}
					<button class="btn preset-tonal btn-sm" onclick={() => cloudStore.connect()}>
						Reconnect cloud
					</button>
				{/if}
				<button
					class="btn preset-tonal btn-sm"
					onclick={() => {
						cloudStore.error = '';
					}}>Dismiss</button
				>
			</div>
		{/if}
		{@render children()}
	</main>
</div>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				{#if toast.description}<Toast.Description>{toast.description}</Toast.Description>{/if}
			</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>

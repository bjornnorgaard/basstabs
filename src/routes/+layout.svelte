<script lang="ts">
	import './layout.css';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { site } from '$lib/site';
	import { AppBar, Toast } from '@skeletonlabs/skeleton-svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Brand from '$lib/components/Brand.svelte';
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
			class="mx-auto grid w-full max-w-[96rem] grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-3 py-2 lg:flex lg:justify-between lg:gap-x-4 lg:px-4"
		>
			<AppBar.Lead class="shrink-0">
				<Brand />
			</AppBar.Lead>
			<AppBar.Trail class="flex items-center justify-end gap-1 lg:flex-1 lg:gap-2">
				<div class="flex items-center gap-1 lg:hidden">
					<a
						href={resolve('/sound')}
						class="btn-icon hover:preset-tonal"
						title="Sound design"
						aria-label="Sound design"
					>
						<SlidersHorizontal class="size-5" />
					</a>
					<ModeToggle />
					<a
						href={resolve('/profile')}
						class="btn-icon overflow-hidden rounded-full hover:preset-tonal"
						title="Profile"
						aria-label="Profile"
					>
						{#if cloudStore.user?.photoURL}
							<img src={cloudStore.user.photoURL} alt="" class="size-7 rounded-full object-cover" />
						{:else}
							<UserRound class="size-5" />
						{/if}
					</a>
				</div>
				<div class="hidden items-center gap-2 lg:flex">
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
					<ModeToggle />
				</div>
			</AppBar.Trail>
			<div class="col-span-2 flex items-center gap-2 lg:hidden">
				<a href={resolve('/public')} class="btn preset-tonal btn-sm">
					<span class="max-[360px]:hidden">Public tabs</span>
					<span class="hidden max-[360px]:inline">Public</span>
				</a>
				<button type="button" class="btn preset-filled-primary-500" onclick={newTab}>
					<Plus class="size-4" /> New tab
				</button>
			</div>
		</AppBar.Toolbar>
	</AppBar>

	<main class="mx-auto w-full max-w-[96rem] min-w-0 flex-1 p-3 sm:p-4 md:p-6">
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

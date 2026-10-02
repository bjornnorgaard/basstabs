<script lang="ts">
	import { site } from '$lib/site';
	import { cloudStore } from '$lib/stores/cloud.svelte';
	import UserRound from '@lucide/svelte/icons/user-round';
</script>

<svelte:head>
	<title>Profile · {site.name}</title>
	<meta name="robots" content="noindex, follow" />
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<header class="space-y-1">
		<h1 class="h2">Profile</h1>
		<p class="opacity-70">Manage your sign-in and cloud account.</p>
	</header>

	{#if !cloudStore.ready}
		<p role="status">Checking sign-in...</p>
	{:else if cloudStore.user}
		<section class="space-y-4 card preset-tonal-surface p-4 sm:p-6">
			<div class="flex min-w-0 items-center gap-4">
				{#if cloudStore.user.photoURL}
					<img
						src={cloudStore.user.photoURL}
						alt=""
						class="size-14 shrink-0 rounded-full object-cover"
					/>
				{:else}
					<div
						class="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-200-800"
					>
						<UserRound class="size-7" />
					</div>
				{/if}
				<div class="min-w-0">
					<h2 class="truncate h4">{cloudStore.user.displayName || 'Signed in'}</h2>
					<p class="text-sm break-words opacity-70">{cloudStore.user.email}</p>
				</div>
			</div>
			<p class="text-sm opacity-70">
				Local tabs stay in this browser. Cloud tabs are available while signed in.
			</p>
			<div>
				<button
					type="button"
					class="btn preset-tonal"
					disabled={cloudStore.busy}
					onclick={() => cloudStore.logout()}
				>
					{cloudStore.busy ? 'Signing out...' : 'Sign out'}
				</button>
			</div>
		</section>
	{:else}
		<section class="space-y-4 card preset-tonal-surface p-4 sm:p-6">
			<div class="flex items-center gap-4">
				<div
					class="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-200-800"
				>
					<UserRound class="size-7" />
				</div>
				<div>
					<h2 class="h4">Not signed in</h2>
					<p class="text-sm opacity-70">Sign in to save tabs to the cloud.</p>
				</div>
			</div>
			<button
				type="button"
				class="btn preset-filled-primary-500"
				disabled={cloudStore.busy}
				onclick={() => cloudStore.login()}
			>
				{cloudStore.busy ? 'Signing in...' : 'Sign in with Google'}
			</button>
		</section>
	{/if}
</div>

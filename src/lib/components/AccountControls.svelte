<script lang="ts">
	import { resolve } from '$app/paths';
	import { cloudStore } from '$lib/stores/cloud.svelte';
	import UserRound from '@lucide/svelte/icons/user-round';
</script>

{#if !cloudStore.ready}
	<span class="text-sm opacity-60">
		<span class="sm:hidden">Checking…</span>
		<span class="hidden sm:inline">Checking sign-in...</span>
	</span>
{:else if cloudStore.user}
	<a
		href={resolve('/profile')}
		class="btn-icon shrink-0 overflow-hidden rounded-full p-0 hover:preset-tonal"
		title="Profile"
		aria-label="Profile"
	>
		{#if cloudStore.user.photoURL}
			<img
				src={cloudStore.user.photoURL}
				alt=""
				class="size-7 shrink-0 rounded-full object-cover"
			/>
		{:else}
			<UserRound class="size-5" />
		{/if}
	</a>
{:else}
	<button
		class="btn preset-tonal btn-sm"
		disabled={cloudStore.busy}
		onclick={() => cloudStore.login()}
	>
		<span class="sm:hidden">Sign in</span>
		<span class="hidden sm:inline">Sign in with Google</span>
	</button>
{/if}

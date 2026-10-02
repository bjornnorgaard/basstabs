<script lang="ts">
	import { resolve } from '$app/paths';
	import { cloudStore } from '$lib/stores/cloud.svelte';
</script>

{#if !cloudStore.ready}
	<span class="text-sm opacity-60">
		<span class="sm:hidden">Checking…</span>
		<span class="hidden sm:inline">Checking sign-in...</span>
	</span>
{:else if cloudStore.user}
	<a
		href={resolve('/profile')}
		class="max-w-40 truncate text-sm hover:underline"
		title={cloudStore.user.email ?? ''}
	>
		{cloudStore.user.displayName ?? 'Profile'}
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

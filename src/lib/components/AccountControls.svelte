<script lang="ts">
	import { cloudStore } from '$lib/stores/cloud.svelte';
</script>

{#if !cloudStore.ready}
	<span class="text-sm opacity-60">Checking sign-in...</span>
{:else if cloudStore.user}
	<div class="flex flex-wrap items-center gap-2">
		<span class="max-w-40 truncate text-sm" title={cloudStore.user.email ?? ''}>
			{cloudStore.user.displayName ?? 'Signed in'}
		</span>
		<button
			class="btn preset-tonal btn-sm"
			disabled={cloudStore.busy}
			onclick={() => cloudStore.logout()}
		>
			Sign out
		</button>
	</div>
{:else}
	<button
		class="btn preset-tonal btn-sm"
		disabled={cloudStore.busy}
		onclick={() => cloudStore.login()}
	>
		Sign in with Google
	</button>
{/if}

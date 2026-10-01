<script lang="ts">
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	let mode = $state(document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light');

	function toggle() {
		mode = mode === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.mode = mode;
		localStorage.setItem('basstabs:mode', mode);
	}
</script>

<button
	type="button"
	class="btn-icon hover:preset-tonal"
	onclick={toggle}
	aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	title={mode === 'dark' ? 'Light mode' : 'Dark mode'}
>
	{#if mode === 'dark'}<Sun class="size-5" />{:else}<Moon class="size-5" />{/if}
</button>

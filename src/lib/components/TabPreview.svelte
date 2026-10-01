<script lang="ts">
	interface Props {
		text: string;
		placeholder?: string;
		class?: string;
	}

	let { text, placeholder = 'Nothing to show yet.', class: className = '' }: Props = $props();
</script>

{#if text}
	<pre
		class="overflow-x-auto rounded-container tab-surface p-4 font-tab text-sm leading-snug {className}">{text}</pre>
{:else}
	<div
		class="flex items-center justify-center rounded-container border-2 border-dashed border-surface-300-700 p-8 text-sm opacity-60 {className}"
	>
		{placeholder}
	</div>
{/if}

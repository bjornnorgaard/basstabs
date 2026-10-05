<script lang="ts">
	import { fillerParts, stringHue } from '$lib/tab/highlight';
	import type { BlockLayout } from '$lib/tab/render';
	import type { Tuning } from '$lib/tab/tuning';

	interface Props {
		blocks: BlockLayout[];
		tuning: Tuning;
		placeholder?: string;
		class?: string;
	}

	let {
		blocks,
		tuning,
		placeholder = 'Nothing to show yet.',
		class: className = ''
	}: Props = $props();
</script>

{#if blocks.length}
	<div
		class="overflow-x-auto rounded-container tab-surface p-4 font-tab text-sm leading-snug [font-variant-ligatures:none] {className}"
	>
		{#each blocks as block, i (i)}
			{@const gap = i > 0 && blocks[i - 1].kind === 'system'}
			{#if block.kind === 'section'}
				<div class="whitespace-pre {gap ? 'mt-[1lh]' : ''}">
					<span class="hl-section">{block.text}</span>
				</div>
			{:else if block.kind === 'annotation'}
				<div class="hl-comment whitespace-pre {gap ? 'mt-[1lh]' : ''}">{block.text}</div>
			{:else if block.kind === 'tempo'}
				<div class="hl-tempo whitespace-pre {gap ? 'mt-[1lh]' : ''}">{block.text}</div>
			{:else}
				<div class={gap ? 'mt-[1lh]' : ''}>
					{#each block.lines as line (line.string)}
						<div
							class="whitespace-pre"
							style:--string-hue={stringHue(tuning.strings[line.string], line.string)}
						>
							{#each line.segments as segment, s (s)}{#if segment.noteId !== undefined}<span
										class="hl-string {segment.text.length > 1 ? 'hl-multi-digit' : ''}"
										>{segment.text}</span
									>{:else}{#each fillerParts(segment.text) as part, p (p)}<span class={part.class}
											>{part.text}</span
										>{/each}{/if}{/each}
						</div>
					{/each}
				</div>
			{/if}
		{/each}
	</div>
{:else}
	<div
		class="flex items-center justify-center rounded-container border-2 border-dashed border-surface-300-700 p-8 text-sm opacity-60 {className}"
	>
		{placeholder}
	</div>
{/if}

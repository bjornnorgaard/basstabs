<script lang="ts">
	import { highlightSegments, stringHue, tokenClass } from '$lib/tab/highlight';
	import { parse } from '$lib/tab/parser';
	import type { Tuning } from '$lib/tab/tuning';

	let { source, tuning }: { source: string; tuning?: Tuning } = $props();

	const segments = $derived(
		tuning ? highlightSegments(source, parse(source, tuning).tokens) : [{ text: source }]
	);
</script>

<code
	class="rounded-base bg-surface-50-950 px-1 font-tab whitespace-pre text-surface-950-50 [font-variant-ligatures:none]"
	>{#each segments as segment, i (i)}{#if segment.token}<span
				class={segment.token.kind === 'invalid' ? '' : tokenClass(segment.token)}
				style:--string-hue={segment.token.string !== undefined
					? stringHue(tuning!.strings[segment.token.string], segment.token.string)
					: undefined}>{segment.text}</span
			>{:else}{segment.text}{/if}{/each}</code
>

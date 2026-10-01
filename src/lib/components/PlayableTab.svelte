<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import Repeat from '@lucide/svelte/icons/repeat';
	import Square from '@lucide/svelte/icons/square';
	import { onDestroy, untrack } from 'svelte';
	import { player } from '$lib/audio/player.svelte';
	import TabPreview from '$lib/components/TabPreview.svelte';
	import { stringHue } from '$lib/tab/highlight';
	import { buildSchedule } from '$lib/tab/playback';
	import type { MeasureLayout, TabLayout } from '$lib/tab/render';
	import type { Tuning } from '$lib/tab/tuning';

	interface Props {
		layout: TabLayout;
		tuning: Tuning;
		placeholder?: string;
		class?: string;
		/** A note to outline, e.g. the one under the editor's caret. */
		focusedNote?: number;
	}

	let { layout, tuning, placeholder, class: className = '', focusedNote }: Props = $props();

	// Note and bar ids shift when the tab changes, so stop instead of highlighting stale notes.
	const signature = $derived(`${tuning.id}\n${layout.text}`);
	$effect(() => {
		void signature;
		untrack(() => player.stop());
	});
	onDestroy(() => player.stop());

	const sectionMeasures = $derived(
		layout.blocks.reduce<MeasureLayout[][]>((acc, block) => {
			if (block.kind === 'system' && block.section !== undefined) {
				(acc[block.section] ??= []).push(...block.measures);
			}
			return acc;
		}, [])
	);

	function trigger(event: MouseEvent, key: string, label: string, measures: MeasureLayout[]) {
		if (player.key === key) {
			player.stop();
			return;
		}
		player.play(buildSchedule(measures, tuning), { key, label, loop: event.shiftKey });
	}

	const hint = 'Click to play · Shift+click to loop';

	/** Splits the filler between notes into the string label, dashes and bar lines for styling. */
	function fillerParts(text: string) {
		return [...text.matchAll(/-+|\|+|\s+|[^-|\s]+/g)].map(([part]) => ({
			text: part,
			class:
				part[0] === '-'
					? 'hl-fill'
					: part[0] === '|'
						? 'hl-bar'
						: /\S/.test(part)
							? 'hl-string-name'
							: ''
		}));
	}
</script>

{#snippet gutterButton(key: string, label: string, measures: MeasureLayout[])}
	{@const active = player.key === key}
	<button
		type="button"
		class="flex size-5 items-center justify-center rounded-base transition-opacity hover:preset-tonal-primary focus-visible:opacity-100 {active
			? 'preset-filled-primary-500 opacity-100'
			: 'opacity-0 group-hover:opacity-100 pointer-coarse:opacity-40'}"
		aria-label="{active ? 'Stop' : 'Play'} {label}"
		title={active ? 'Stop' : hint}
		onclick={(e) => trigger(e, key, label, measures)}
	>
		{#if active}<Square class="size-3" />{:else}<Play class="size-3" />{/if}
	</button>
{/snippet}

{#if !layout.text}
	<TabPreview text="" {placeholder} class={className} />
{:else}
	<div class="rounded-container tab-surface {className}">
		<div
			class="flex flex-wrap items-center gap-2 border-b border-surface-200-800 px-4 py-2 text-sm"
		>
			<button
				type="button"
				class="btn btn-sm {player.key === 'all' ? 'preset-filled-primary-500' : 'preset-tonal'}"
				title={player.key === 'all' ? 'Stop' : hint}
				onclick={(e) => trigger(e, 'all', 'the whole tab', layout.measures)}
			>
				{#if player.key === 'all'}
					<Square class="size-4" /> Stop
				{:else}
					<Play class="size-4" /> Play all
				{/if}
			</button>
			{#if player.playing && player.key !== 'all'}
				<button type="button" class="btn preset-tonal btn-sm" onclick={() => player.stop()}>
					<Square class="size-4" /> Stop
				</button>
			{/if}
			<button
				type="button"
				class="btn-icon btn-icon-sm {player.looping ? 'preset-filled-primary-500' : 'preset-tonal'}"
				aria-pressed={player.looping}
				aria-label="Loop"
				title="Loop"
				onclick={() => player.toggleLoop()}
			>
				<Repeat class="size-4" />
			</button>
			<label class="flex items-center gap-2">
				<span class="opacity-70">BPM</span>
				<input
					type="number"
					class="input w-20 px-2 py-1"
					min="30"
					max="300"
					step="5"
					value={player.bpm}
					onchange={(e) => player.setBpm(e.currentTarget.valueAsNumber)}
				/>
			</label>
			<span class="ml-auto opacity-70" aria-live="polite">
				{#if player.playing}
					Playing {player.label}{player.looping ? ' (looping)' : ''}
				{:else}
					Hover a section, row or bar to play it. Shift+click loops.
				{/if}
			</span>
		</div>

		<div class="overflow-x-auto p-4 font-tab text-sm leading-snug [font-variant-ligatures:none]">
			<div class="w-max min-w-full">
				{#each layout.blocks as block, i (i)}
					{@const gap = i > 0 && layout.blocks[i - 1].kind === 'system'}
					{#if block.kind === 'section'}
						<div class="group flex items-center gap-1 {gap ? 'mt-[1lh]' : ''}">
							<div class="w-5 shrink-0">
								{#if sectionMeasures[block.index]?.length}
									{@render gutterButton(
										`section:${block.index}`,
										block.title,
										sectionMeasures[block.index]
									)}
								{/if}
							</div>
							<div class="whitespace-pre"><span class="hl-section">{block.text}</span></div>
						</div>
					{:else if block.kind === 'annotation'}
						<div class="flex gap-1 {gap ? 'mt-[1lh]' : ''}">
							<div class="w-5 shrink-0"></div>
							<div class="hl-comment whitespace-pre">{block.text}</div>
						</div>
					{:else}
						<div class="group flex items-center gap-1 {gap ? 'mt-[1lh]' : ''}">
							<div class="w-5 shrink-0">
								{@render gutterButton(
									`row:${block.index}`,
									`row ${block.index + 1}`,
									block.measures
								)}
							</div>
							<div class="relative">
								{#each block.lines as line (line.string)}
									<div
										class="whitespace-pre"
										style:--string-hue={stringHue(tuning.strings[line.string], line.string)}
									>
										{#each line.segments as segment, s (s)}{#if segment.noteId !== undefined}<span
													class="rounded-xs {player.activeNoteId === segment.noteId
														? 'preset-filled-primary-500'
														: segment.noteId === focusedNote
															? 'hl-string hl-focus'
															: 'hl-string'}">{segment.text}</span
												>{:else}{#each fillerParts(segment.text) as part, p (p)}<span
														class={part.class}>{part.text}</span
													>{/each}{/if}{/each}
									</div>
								{/each}
								{#each block.measures as measure (measure.id)}
									{@const key = `bar:${measure.id}`}
									<button
										type="button"
										class="absolute inset-y-0 cursor-pointer rounded-xs transition-colors hover:bg-primary-500/15 focus-visible:bg-primary-500/15 {player.activeMeasureId ===
										measure.id
											? 'bg-primary-500/20'
											: ''} {player.key === key ? 'ring-1 ring-primary-500' : ''}"
										style:left="{measure.column}ch"
										style:width="{measure.width}ch"
										aria-label="{player.key === key ? 'Stop' : 'Play'} bar {measure.id + 1}"
										title="Bar {measure.id + 1} · {hint}"
										onclick={(e) => trigger(e, key, `bar ${measure.id + 1}`, [measure])}
									></button>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	</div>
{/if}

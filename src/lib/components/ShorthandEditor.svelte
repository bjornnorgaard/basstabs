<script lang="ts">
	import { player } from '$lib/audio/player.svelte';
	import type { SourceToken } from '$lib/tab/parser';
	import { highlightSegments, noteAtCaret, stringHue, tokenClass } from '$lib/tab/highlight';
	import type { Tuning } from '$lib/tab/tuning';

	interface Props {
		value: string;
		tokens: SourceToken[];
		tuning: Tuning;
		invalid?: boolean;
		placeholder?: string;
		/** The note under the caret, in playing order. Cleared when the editor loses focus. */
		focusedNote?: number;
		textarea?: HTMLTextAreaElement;
		oninput: (value: string) => void;
	}

	let {
		value,
		tokens,
		tuning,
		invalid = false,
		placeholder,
		focusedNote = $bindable(),
		textarea = $bindable(),
		oninput
	}: Props = $props();

	const segments = $derived(highlightSegments(value, tokens));

	function trackCaret() {
		if (!textarea || document.activeElement !== textarea) return;
		const { selectionStart, selectionEnd } = textarea;
		focusedNote = selectionStart === selectionEnd ? noteAtCaret(tokens, selectionStart) : undefined;
	}

	// Tokens change after input is parsed, so re-resolve the caret once they're up to date.
	$effect(() => {
		void tokens;
		trackCaret();
	});

	function classFor(token: SourceToken): string {
		const classes = [tokenClass(token)];
		if (token.note !== undefined) {
			if (token.note === player.activeNoteId) classes.push('preset-filled-primary-500 rounded-xs');
			else if (token.note === focusedNote) classes.push('hl-focus');
		}
		return classes.join(' ');
	}

	// Keeps a trailing newline visible and leaves one empty row below the text to type into.
	const TRAILER = '\n ';

	const shared =
		'textarea col-start-1 row-start-1 min-w-0 font-tab text-base leading-relaxed whitespace-pre-wrap break-words [font-variant-ligatures:none] [tab-size:4]';
</script>

<svelte:document onselectionchange={trackCaret} />

<!--
	The textarea sits on top of a highlighted copy of its text. Its own text is transparent so only the
	caret and selection show, and both layers share one grid cell so the editor grows with its content.
-->
<div class="grid">
	<pre
		aria-hidden="true"
		class="{shared} pointer-events-none m-0 overflow-hidden">{#each segments as segment, i (i)}{#if segment.token}<span
					class={classFor(segment.token)}
					style:--string-hue={segment.token.string !== undefined
						? stringHue(tuning.strings[segment.token.string], segment.token.string)
						: undefined}>{segment.text}</span
				>{:else}{segment.text}{/if}{/each}{TRAILER}</pre>
	<textarea
		bind:this={textarea}
		class="{shared} resize-none overflow-hidden bg-transparent text-transparent caret-surface-950-50 selection:bg-primary-500/30 selection:text-transparent"
		rows="2"
		spellcheck="false"
		autocapitalize="off"
		autocomplete="off"
		{placeholder}
		aria-label="Tab shorthand"
		aria-invalid={invalid}
		{value}
		oninput={(e) => oninput(e.currentTarget.value)}
		onkeyup={trackCaret}
		onclick={trackCaret}
		onselect={trackCaret}
		onfocus={trackCaret}
		onblur={() => (focusedNote = undefined)}></textarea>
</div>

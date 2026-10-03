<script lang="ts">
	import { onMount } from 'svelte';
	import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state';
	import {
		addCursorAbove,
		addCursorBelow,
		defaultKeymap,
		history,
		historyKeymap,
		indentWithTab
	} from '@codemirror/commands';
	import { selectNextOccurrence } from '@codemirror/search';
	import {
		Decoration,
		drawSelection,
		EditorView,
		keymap,
		placeholder as placeholderExtension,
		type DecorationSet
	} from '@codemirror/view';
	import { player } from '$lib/audio/player.svelte';
	import type { SourceToken } from '$lib/tab/parser';
	import { noteAtCaret, stringHue, tokenClass } from '$lib/tab/highlight';
	import type { Tuning } from '$lib/tab/tuning';

	interface Props {
		value: string;
		tokens: SourceToken[];
		tuning: Tuning;
		invalid?: boolean;
		placeholder?: string;
		/** The note under the main cursor, in playing order. Cleared when the editor loses focus. */
		focusedNote?: number;
		/** Grow with the content instead of a fixed five-line height that scrolls. */
		autoGrow?: boolean;
		editor?: EditorView;
		oninput: (value: string) => void;
	}

	let {
		value,
		tokens,
		tuning,
		invalid = false,
		placeholder,
		focusedNote = $bindable(),
		autoGrow = false,
		editor = $bindable(),
		oninput
	}: Props = $props();

	let host: HTMLDivElement;
	const refreshHighlight = StateEffect.define<void>();
	const sizing = new Compartment();

	function sizingTheme(grow: boolean) {
		return EditorView.theme(
			grow
				? { '.cm-scroller': { overflow: 'visible' } }
				: { '&': { height: '5lh' }, '.cm-scroller': { overflow: 'auto' } }
		);
	}

	function tokenDecorations(state: EditorState): DecorationSet {
		const marks = tokens.flatMap((token) => {
			if (token.end > state.doc.length || token.start >= token.end) return [];
			const classes = [tokenClass(token)];
			if (token.note !== undefined) {
				if (token.note === player.activeNoteId)
					classes.push('preset-filled-primary-500 rounded-xs');
				else if (token.note === focusedNote) classes.push('hl-focus');
			}
			const hue =
				token.string !== undefined
					? stringHue(tuning.strings[token.string], token.string)
					: undefined;
			return [
				Decoration.mark({
					class: classes.join(' '),
					attributes: hue === undefined ? {} : { style: `--string-hue: ${hue}` }
				}).range(token.start, token.end)
			];
		});
		return Decoration.set(marks, true);
	}

	function updateFocusedNote(view: EditorView) {
		if (!view.hasFocus) return;
		const selection = view.state.selection.main;
		focusedNote = selection.empty ? noteAtCaret(tokens, selection.head) : undefined;
	}

	onMount(() => {
		const highlightField = StateField.define<DecorationSet>({
			create: tokenDecorations,
			update(decorations, transaction) {
				return transaction.docChanged ||
					transaction.effects.some((effect) => effect.is(refreshHighlight))
					? tokenDecorations(transaction.state)
					: decorations;
			},
			provide: (field) => EditorView.decorations.from(field)
		});

		const view = new EditorView({
			state: EditorState.create({
				doc: value,
				extensions: [
					EditorState.allowMultipleSelections.of(true),
					history(),
					drawSelection(),
					EditorView.lineWrapping,
					placeholderExtension(placeholder ?? ''),
					highlightField,
					sizing.of(sizingTheme(autoGrow)),
					keymap.of([
						{ key: 'Mod-d', run: selectNextOccurrence },
						{ key: 'Mod-Alt-ArrowUp', run: addCursorAbove },
						{ key: 'Mod-Alt-ArrowDown', run: addCursorBelow },
						...defaultKeymap,
						...historyKeymap,
						indentWithTab
					]),
					EditorView.contentAttributes.of({
						'aria-label': 'Tab shorthand',
						'aria-invalid': String(invalid)
					}),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) oninput(update.state.doc.toString());
						if (update.docChanged || update.selectionSet) updateFocusedNote(update.view);
					}),
					EditorView.domEventHandlers({
						blur: () => {
							focusedNote = undefined;
							return false;
						},
						focus: (_event, focusedView) => {
							updateFocusedNote(focusedView);
							return false;
						}
					}),
					EditorView.theme({
						'&': {
							fontFamily: 'inherit',
							fontSize: 'inherit',
							lineHeight: 'inherit',
							color: 'inherit'
						},
						'.cm-scroller': { fontFamily: 'inherit' },
						'.cm-content': {
							minHeight: '3.25rem',
							padding: '0',
							whiteSpace: 'pre-wrap',
							overflowWrap: 'anywhere',
							caretColor: 'currentColor'
						},
						'.cm-line': { padding: '0' },
						'.cm-cursor': { borderLeftColor: 'currentColor' },
						'&.cm-focused': { outline: 'none' },
						'&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
							backgroundColor: 'color-mix(in oklab, var(--color-primary-500) 30%, transparent)'
						},
						'.cm-placeholder': { opacity: '0.5' }
					})
				]
			}),
			parent: host
		});
		editor = view;
		return () => {
			editor = undefined;
			view.destroy();
		};
	});

	$effect(() => {
		void tokens;
		void focusedNote;
		void player.activeNoteId;
		void tuning;
		editor?.dispatch({ effects: refreshHighlight.of() });
	});

	$effect(() => {
		editor?.dispatch({ effects: sizing.reconfigure(sizingTheme(autoGrow)) });
	});

	$effect(() => {
		if (editor) editor.contentDOM.setAttribute('aria-invalid', String(invalid));
	});

	$effect(() => {
		const source = value;
		if (editor && editor.state.doc.toString() !== source) {
			editor.dispatch({
				changes: { from: 0, to: editor.state.doc.length, insert: source }
			});
		}
	});
</script>

<div
	bind:this={host}
	class="min-w-0 rounded-base bg-transparent font-tab text-base leading-relaxed"
	aria-invalid={invalid}
></div>

import type { Tuning } from './tuning';

/** A single fretted note on a given string (index into tuning.strings, low to high). */
export interface NoteEvent {
	kind: 'note';
	string: number;
	fret: number;
	/**
	 * True when this note was written with no whitespace between it and the previous
	 * note in the same measure (e.g. the `320` in `E320`). Such notes are played in
	 * quick succession and should be rendered packed together, without filler between them.
	 */
	joinedToPrevious: boolean;
}

/** One rhythmic column in the tab. Kept as a union so new indicators can be added later. */
export type TabEvent = NoteEvent;

export interface Measure {
	events: TabEvent[];
	/** Whitespace columns after the final note, before the bar line or end of row. */
	trailingSpaces: number;
}

/** A row of measures rendered together (one input line = one system). */
export interface System {
	kind: 'system';
	measures: Measure[];
}

export interface Section {
	kind: 'section';
	title: string;
}

export interface Annotation {
	kind: 'annotation';
	text: string;
}

export type TabBlock = System | Section | Annotation;

export interface ParseError {
	message: string;
	/** 1-based line number in the source. */
	line: number;
	/** 1-based column in the source. */
	column: number;
	length: number;
}

export type SourceTokenKind = 'string' | 'fret' | 'bar' | 'section' | 'comment' | 'invalid';

/** A highlightable span of the source, used for syntax highlighting in the editor. */
export interface SourceToken {
	kind: SourceTokenKind;
	/** 0-based offset into the source (inclusive). */
	start: number;
	/** 0-based offset into the source (exclusive). */
	end: number;
	/** Index into `tuning.strings` for `string` and `fret` tokens. */
	string?: number;
	/** Index of the note this token belongs to, in playing order (matches `NoteLayout.id`). */
	note?: number;
}

export interface ParseResult {
	systems: System[];
	blocks: TabBlock[];
	errors: ParseError[];
	/** Highlightable spans in source order. Whitespace and unhighlighted text is omitted. */
	tokens: SourceToken[];
}

const NOTE_PATTERN = /^([A-Za-z])?(\d+)$/;

/**
 * Parses the shorthand syntax, e.g. `E0 0 A2 2 |E0 0 3 A2 |`.
 *
 * - `<String><fret>` plays a fret on a string (`E0`, `A12`). String letters are case-insensitive.
 * - `<fret>` alone reuses the most recently named string.
 * - `|` ends a measure. It may be attached to a note (`2|`, `|E0`).
 * - Each non-empty note line becomes its own system (a separate block of tab).
 * - `[Name]` on its own line starts a named section.
 * - `# Text` on its own line displays a note above the next row of tab.
 */
export function parse(source: string, tuning: Tuning): ParseResult {
	const systems: System[] = [];
	const blocks: TabBlock[] = [];
	const errors: ParseError[] = [];
	const sourceTokens: SourceToken[] = [];
	const stringIndex = new Map(tuning.strings.map((name, i) => [name.toUpperCase(), i]));
	let currentString: number | undefined;
	let noteCount = 0;
	let lineOffset = 0;

	source.split('\n').forEach((rawLine, lineIdx) => {
		const lineText = rawLine.replace(/\r$/, '');
		const offset = lineOffset;
		lineOffset += rawLine.length + 1;
		const trimmed = lineText.trim();
		const trimmedStart = offset + lineText.length - lineText.trimStart().length;
		const trimmedSpan = { start: trimmedStart, end: trimmedStart + trimmed.length };
		if (trimmed.startsWith('#')) {
			blocks.push({ kind: 'annotation', text: trimmed.slice(1).trim() });
			sourceTokens.push({ kind: 'comment', ...trimmedSpan });
			return;
		}
		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			const title = trimmed.slice(1, -1).trim();
			if (title) {
				blocks.push({ kind: 'section', title });
				sourceTokens.push({ kind: 'section', ...trimmedSpan });
			} else {
				sourceTokens.push({ kind: 'invalid', ...trimmedSpan });
				errors.push({
					line: lineIdx + 1,
					column: lineText.indexOf('[') + 1,
					length: trimmed.length,
					message: 'Section name cannot be empty'
				});
			}
			return;
		}

		const measures: Measure[] = [];
		let events: TabEvent[] = [];
		let lastNoteEnd = -1;
		// End index (0-based, exclusive) in lineText of the previously emitted note, used to
		// detect notes written back-to-back with no whitespace between them. Reset whenever a
		// measure ends, since joining never crosses a bar line.
		let previousEventEnd = -1;

		const closeMeasure = (end: number) => {
			if (events.length > 0) {
				const trailing = lineText.slice(lastNoteEnd, end);
				measures.push({
					events,
					trailingSpaces: /^[ \t]*$/.test(trailing) ? trailing.length : 0
				});
			}
			events = [];
			previousEventEnd = -1;
			lastNoteEnd = -1;
		};

		// A 3+ digit run after a string prefix is a single-digit note followed by frets.
		const tokenRe = /\||[A-Za-z]\d(?=\d{2})|[A-Za-z]\d+|\d+|[^\s|]+/g;
		let match: RegExpExecArray | null;
		let splitFollowingDigits = false;
		let previousTokenEnd = -1;
		while ((match = tokenRe.exec(lineText)) !== null) {
			const matchedToken = match[0];
			const adjacentDigits =
				/^\d+$/.test(matchedToken) && splitFollowingDigits && match.index === previousTokenEnd;
			const tokens = adjacentDigits ? [...matchedToken] : [matchedToken];
			splitFollowingDigits =
				/^[A-Za-z]\d$/.test(matchedToken) && /^\d{2}/.test(lineText.slice(tokenRe.lastIndex));
			previousTokenEnd = tokenRe.lastIndex;

			for (const [partIndex, token] of tokens.entries()) {
				const start = match.index + partIndex;
				const position = {
					line: lineIdx + 1,
					column: start + 1,
					length: token.length
				};

				const span = { start: offset + start, end: offset + start + token.length };

				if (token === '|') {
					sourceTokens.push({ kind: 'bar', ...span });
					closeMeasure(start);
					continue;
				}

				const joinedToPrevious = previousEventEnd !== -1 && start === previousEventEnd;
				previousEventEnd = start + token.length;

				const note = NOTE_PATTERN.exec(token);
				if (!note) {
					sourceTokens.push({ kind: 'invalid', ...span });
					errors.push({ ...position, message: `Unrecognised token "${token}"` });
					continue;
				}

				const [, letter, fretText] = note;
				if (letter) {
					const idx = stringIndex.get(letter.toUpperCase());
					if (idx === undefined) {
						sourceTokens.push({ kind: 'invalid', ...span });
						errors.push({
							...position,
							message: `Unknown string "${letter}" (tuning has ${tuning.strings.join(', ')})`
						});
						continue;
					}
					currentString = idx;
				} else if (currentString === undefined) {
					sourceTokens.push({ kind: 'invalid', ...span });
					errors.push({
						...position,
						message: `Fret "${fretText}" has no string – prefix it with a string name, e.g. ${tuning.strings[0]}${fretText}`
					});
					continue;
				}

				const noteToken = { string: currentString, note: noteCount++ };
				if (letter) {
					sourceTokens.push({
						kind: 'string',
						start: span.start,
						end: span.start + 1,
						...noteToken
					});
				}
				sourceTokens.push({
					kind: 'fret',
					start: span.end - fretText.length,
					end: span.end,
					...noteToken
				});
				events.push({
					kind: 'note',
					string: currentString,
					fret: Number(fretText),
					joinedToPrevious
				});
				lastNoteEnd = start + token.length;
			}
		}

		closeMeasure(lineText.length);
		if (measures.length > 0) {
			const system: System = { kind: 'system', measures };
			systems.push(system);
			blocks.push(system);
		}
	});

	return { systems, blocks, errors, tokens: sourceTokens };
}

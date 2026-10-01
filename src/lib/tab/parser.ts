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

export interface ParseResult {
	systems: System[];
	blocks: TabBlock[];
	errors: ParseError[];
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
	const stringIndex = new Map(tuning.strings.map((name, i) => [name.toUpperCase(), i]));
	let currentString: number | undefined;

	source.split(/\r?\n/).forEach((lineText, lineIdx) => {
		const trimmed = lineText.trim();
		if (trimmed.startsWith('#')) {
			blocks.push({ kind: 'annotation', text: trimmed.slice(1).trim() });
			return;
		}
		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			const title = trimmed.slice(1, -1).trim();
			if (title) {
				blocks.push({ kind: 'section', title });
			} else {
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
		// End index (0-based, exclusive) in lineText of the previously emitted note, used to
		// detect notes written back-to-back with no whitespace between them. Reset whenever a
		// measure ends, since joining never crosses a bar line.
		let previousEventEnd = -1;

		const closeMeasure = () => {
			if (events.length > 0) measures.push({ events });
			events = [];
			previousEventEnd = -1;
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

				if (token === '|') {
					closeMeasure();
					continue;
				}

				const joinedToPrevious = previousEventEnd !== -1 && start === previousEventEnd;
				previousEventEnd = start + token.length;

				const note = NOTE_PATTERN.exec(token);
				if (!note) {
					errors.push({ ...position, message: `Unrecognised token "${token}"` });
					continue;
				}

				const [, letter, fretText] = note;
				if (letter) {
					const idx = stringIndex.get(letter.toUpperCase());
					if (idx === undefined) {
						errors.push({
							...position,
							message: `Unknown string "${letter}" (tuning has ${tuning.strings.join(', ')})`
						});
						continue;
					}
					currentString = idx;
				} else if (currentString === undefined) {
					errors.push({
						...position,
						message: `Fret "${fretText}" has no string – prefix it with a string name, e.g. ${tuning.strings[0]}${fretText}`
					});
					continue;
				}

				events.push({
					kind: 'note',
					string: currentString,
					fret: Number(fretText),
					joinedToPrevious
				});
			}
		}

		closeMeasure();
		if (measures.length > 0) {
			const system: System = { kind: 'system', measures };
			systems.push(system);
			blocks.push(system);
		}
	});

	return { systems, blocks, errors };
}

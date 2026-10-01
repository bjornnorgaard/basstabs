import type { Tuning } from './tuning';

/** A single fretted note on a given string (index into tuning.strings, low to high). */
export interface NoteEvent {
	kind: 'note';
	string: number;
	fret: number;
}

/** One rhythmic column in the tab. Kept as a union so new indicators can be added later. */
export type TabEvent = NoteEvent;

export interface Measure {
	events: TabEvent[];
}

/** A row of measures rendered together (one input line = one system). */
export interface System {
	measures: Measure[];
}

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
	errors: ParseError[];
}

const NOTE_PATTERN = /^([A-Za-z])?(\d+)$/;

/**
 * Parses the shorthand syntax, e.g. `E0 0 A2 2 |E0 0 3 A2 |`.
 *
 * - `<String><fret>` plays a fret on a string (`E0`, `A12`). String letters are case-insensitive.
 * - `<fret>` alone reuses the most recently named string.
 * - `|` ends a measure. It may be attached to a note (`2|`, `|E0`).
 * - Each non-empty line becomes its own system (a separate block of tab).
 */
export function parse(source: string, tuning: Tuning): ParseResult {
	const systems: System[] = [];
	const errors: ParseError[] = [];
	const stringIndex = new Map(tuning.strings.map((name, i) => [name.toUpperCase(), i]));
	let currentString: number | undefined;

	source.split(/\r?\n/).forEach((lineText, lineIdx) => {
		const measures: Measure[] = [];
		let events: TabEvent[] = [];

		const closeMeasure = () => {
			if (events.length > 0) measures.push({ events });
			events = [];
		};

		const tokenRe = /\||[^\s|]+/g;
		let match: RegExpExecArray | null;
		while ((match = tokenRe.exec(lineText)) !== null) {
			const token = match[0];
			const position = { line: lineIdx + 1, column: match.index + 1, length: token.length };

			if (token === '|') {
				closeMeasure();
				continue;
			}

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

			events.push({ kind: 'note', string: currentString, fret: Number(fretText) });
		}

		closeMeasure();
		if (measures.length > 0) systems.push({ measures });
	});

	return { systems, errors };
}

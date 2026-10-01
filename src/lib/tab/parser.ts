import type { Tuning } from './tuning';

/** A single fretted note on a given string (index into tuning.strings, low to high). */
export interface NoteEvent {
	kind: 'note';
	string: number;
	fret: number;
	compact?: boolean;
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
const COMPACT_NOTES_PATTERN = /^(?:[A-Za-z]\d+){2,}$/;

/**
 * Parses the shorthand syntax, e.g. `E0 0 A2 2 |E0 0 3 A2 |`.
 *
 * - `<String><fret>` plays a fret on a string (`E0`, `A12`). String letters are case-insensitive.
 * - `<fret>` alone reuses the most recently named string.
 * - Adjacent string-prefixed notes such as `A2E320` play `A2 E3 2 0`; digits in a compact group are single frets.
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

			const compact = COMPACT_NOTES_PATTERN.test(token);
			const notes = compact
				? Array.from(token.matchAll(/[A-Za-z]?\d/g), (part) => ({
						text: part[0],
						column: position.column + part.index
					}))
				: [{ text: token, column: position.column }];

			if (notes.length === 1 && !NOTE_PATTERN.test(token)) {
				errors.push({ ...position, message: `Unrecognised token "${token}"` });
				continue;
			}

			for (const { text, column } of notes) {
				const note = NOTE_PATTERN.exec(text);
				if (!note) {
					errors.push({
						line: position.line,
						column,
						length: text.length,
						message: `Unrecognised token "${text}"`
					});
					continue;
				}

				const [, letter, fretText] = note;
				const notePosition = { line: position.line, column, length: text.length };
				if (letter) {
					const idx = stringIndex.get(letter.toUpperCase());
					if (idx === undefined) {
						errors.push({
							...notePosition,
							message: `Unknown string "${letter}" (tuning has ${tuning.strings.join(', ')})`
						});
						continue;
					}
					currentString = idx;
				} else if (currentString === undefined) {
					errors.push({
						...notePosition,
						message: `Fret "${fretText}" has no string – prefix it with a string name, e.g. ${tuning.strings[0]}${fretText}`
					});
					continue;
				}

				events.push({
					kind: 'note',
					string: currentString,
					fret: Number(fretText),
					...(compact ? { compact: true } : {})
				});
			}
		}

		closeMeasure();
		if (measures.length > 0) systems.push({ measures });
	});

	return { systems, errors };
}

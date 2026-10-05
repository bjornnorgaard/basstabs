import type { Tuning } from './tuning';

/** A single fretted note on a given string (index into tuning.strings, low to high). */
export interface NoteEvent {
	kind: 'note';
	string: number;
	fret: number;
	/** The fret as written, preserving its exact character width. */
	digits: string;
	/** Rendered text when it differs from the fret digits, e.g. ghost notes. */
	display?: string;
	/** Ghost notes render with parentheses and play back as the plain fret. */
	ghost?: boolean;
	/** 0-based column within the measure; string prefixes occupy no columns. */
	column: number;
	/**
	 * True when this note was written with no whitespace between it and the previous
	 * note in the same measure (e.g. the `320` in `E320`). Such notes are played in
	 * quick succession.
	 */
	joinedToPrevious: boolean;
}

export type TechniqueKind =
	'hammer-on' | 'pull-off' | 'slide-up' | 'slide-down' | 'bend' | 'vibrato';

export interface TechniqueEvent {
	kind: 'technique';
	technique: TechniqueKind;
	string: number;
	symbol: string;
	fret?: never;
	digits?: never;
	joinedToPrevious?: never;
	/** 0-based column within the measure; each articulation character occupies one column. */
	column: number;
}

export interface DeadNoteEvent {
	kind: 'dead-note';
	string: number;
	fret?: never;
	digits: 'x';
	/** 0-based column within the measure. */
	column: number;
	joinedToPrevious: boolean;
}

/** One rhythmic column in the tab. Kept as a union so new indicators can be added later. */
export type TabEvent = NoteEvent | TechniqueEvent | DeadNoteEvent;

export interface Measure {
	events: TabEvent[];
	/** Exact number of columns written between the bar lines (or row boundaries). */
	width: number;
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

export type SourceTokenKind =
	'string' | 'fret' | 'technique' | 'bar' | 'section' | 'comment' | 'invalid';

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
	features: {
		articulations: boolean;
	};
}

const CONNECTOR_TECHNIQUES: Record<string, TechniqueKind> = {
	h: 'hammer-on',
	p: 'pull-off',
	'/': 'slide-up',
	'\\': 'slide-down'
};
const POSTFIX_TECHNIQUES: Record<string, TechniqueKind> = { b: 'bend', '~': 'vibrato' };

/**
 * Parses the shorthand syntax, e.g. `E0 0 A2 2 |E0 0 3 A2 |`.
 *
 * - `<String><fret>` plays a fret on a string (`E0`, `A[12]`). String letters are case-insensitive.
 * - Unbracketed digits are individual frets (`E12` means `E1 E2`).
 * - `<fret>` alone reuses the most recently named string.
 * - `|` ends a measure. It may be attached to a note (`2|`, `|E0`).
 * - Each non-empty note line becomes its own system (a separate block of tab).
 * - `[Name]` on its own line starts a named section.
 * - `# Text` on its own line displays a note above the next row of tab.
 */
export function parse(source: string, tuning: Tuning, syntaxVersion: 1 | 2 = 2): ParseResult {
	const systems: System[] = [];
	const blocks: TabBlock[] = [];
	const errors: ParseError[] = [];
	const sourceTokens: SourceToken[] = [];
	const stringIndex = new Map(tuning.strings.map((name, i) => [name.toUpperCase(), i]));
	const features = { articulations: false };
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
		if (
			syntaxVersion === 1
				? trimmed.startsWith('[') && trimmed.endsWith(']')
				: /^\[[^[\]]*\]$/.test(trimmed)
		) {
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
		let measureColumn = 0;
		let consumedEnd = 0;
		let openingBar = false;
		// End index (0-based, exclusive) in lineText of the previously emitted note, used to
		// detect notes written back-to-back with no whitespace between them. Reset whenever a
		// measure ends, since joining never crosses a bar line.
		let previousEventEnd = -1;
		let previousFrettedNote: { event: NoteEvent; note: number; end: number } | undefined;
		let splitLegacyDigitsEnd = -1;

		const closeMeasure = (end: number, explicit: boolean) => {
			if (!explicit && end > consumedEnd) measureColumn += end - consumedEnd;
			if (events.length > 0 || (openingBar && measureColumn > 0)) {
				measures.push({ events, width: measureColumn });
			}
			events = [];
			measureColumn = 0;
			consumedEnd = end + (explicit ? 1 : 0);
			previousEventEnd = -1;
			previousFrettedNote = undefined;
			splitLegacyDigitsEnd = -1;
			if (explicit) openingBar = true;
		};

		const position = (start: number, length: number) => ({
			line: lineIdx + 1,
			column: start + 1,
			length
		});
		const span = (start: number, end: number) => ({ start: offset + start, end: offset + end });
		const consumeGap = (start: number) => {
			measureColumn += start - consumedEnd;
		};
		const invalidRunEnd = (start: number) => {
			const match = /^[^\s|]+/.exec(lineText.slice(start));
			return start + (match?.[0].length ?? 1);
		};
		const addInvalid = (start: number, end: number, message: string) => {
			sourceTokens.push({ kind: 'invalid', ...span(start, end) });
			errors.push({ ...position(start, end - start), message });
			measureColumn += end - start;
			consumedEnd = end;
			previousEventEnd = end;
			previousFrettedNote = undefined;
		};
		const readFret = (
			start: number
		): { digits: string; tokenEnd: number; fretStart: number } | null => {
			const char = lineText[start];
			if (/\d/.test(char)) return { digits: char, tokenEnd: start + 1, fretStart: start };
			if (char === '[') {
				const match = /^\[(\d+)\]/.exec(lineText.slice(start));
				if (!match) return null;
				return {
					digits: match[1],
					tokenEnd: start + match[0].length,
					fretStart: start
				};
			}
			return null;
		};
		const readGhostFret = (
			start: number
		): { digits: string; tokenEnd: number; fretStart: number; fretEnd: number } | null => {
			const match = /^\((\d+)\)/.exec(lineText.slice(start));
			if (!match) return null;
			return {
				digits: match[1],
				tokenEnd: start + match[0].length,
				fretStart: start + 1,
				fretEnd: start + 1 + match[1].length
			};
		};
		const hasNoteAtom = (start: number) =>
			/\d/.test(lineText[start] ?? '') ||
			lineText[start] === '[' ||
			lineText[start] === '(' ||
			lineText[start] === 'x';
		const resolveString = (letter: string | undefined, fretText: string, start: number) => {
			if (letter) {
				const idx = stringIndex.get(letter.toUpperCase());
				if (idx === undefined) {
					const end = invalidRunEnd(start);
					addInvalid(
						start,
						end,
						`Unknown string "${letter}" (tuning has ${tuning.strings.join(', ')})`
					);
					return undefined;
				}
				currentString = idx;
			} else if (currentString === undefined) {
				const end = invalidRunEnd(start);
				addInvalid(
					start,
					end,
					`Fret "${fretText}" has no string – prefix it with a string name, e.g. ${tuning.strings[0]}${fretText}`
				);
				return undefined;
			}
			return currentString;
		};
		const addStringToken = (letterStart: number, noteToken: { string: number; note: number }) => {
			sourceTokens.push({
				kind: 'string',
				start: offset + letterStart,
				end: offset + letterStart + 1,
				...noteToken
			});
		};
		const addFrettedNote = (
			start: number,
			fretStart: number,
			tokenEnd: number,
			letter: string | undefined,
			digits: string,
			joinedToPrevious: boolean,
			options: { ghost?: boolean; display?: string; stringOverride?: number; fretEnd?: number } = {}
		) => {
			const string = options.stringOverride ?? resolveString(letter, digits, start);
			if (string === undefined) return false;
			const fret = Number(digits);
			if (!Number.isSafeInteger(fret)) {
				addInvalid(start, tokenEnd, `Fret "${digits}" is out of range`);
				return false;
			}
			const note = noteCount++;
			const noteToken = { string, note };
			if (letter) addStringToken(start, noteToken);
			if (options.ghost) {
				features.articulations = true;
				sourceTokens.push({ kind: 'technique', ...span(fretStart - 1, fretStart), ...noteToken });
				sourceTokens.push({
					kind: 'fret',
					...span(fretStart, options.fretEnd ?? fretStart),
					...noteToken
				});
				sourceTokens.push({
					kind: 'technique',
					...span(options.fretEnd ?? fretStart, tokenEnd),
					...noteToken
				});
			} else {
				sourceTokens.push({ kind: 'fret', ...span(fretStart, tokenEnd), ...noteToken });
			}
			const event: NoteEvent = {
				kind: 'note',
				string,
				fret,
				digits,
				column: measureColumn,
				joinedToPrevious
			};
			if (options.display) event.display = options.display;
			if (options.ghost) event.ghost = true;
			events.push(event);
			measureColumn += (options.display ?? digits).length;
			consumedEnd = tokenEnd;
			previousEventEnd = tokenEnd;
			previousFrettedNote = { event, note, end: tokenEnd };
			return true;
		};
		const addDeadNote = (
			start: number,
			tokenEnd: number,
			letter: string | undefined,
			joinedToPrevious: boolean
		) => {
			const string = resolveString(letter, 'x', start);
			if (string === undefined) return false;
			features.articulations = true;
			const note = noteCount++;
			const noteToken = { string, note };
			if (letter) addStringToken(start, noteToken);
			sourceTokens.push({ kind: 'technique', ...span(tokenEnd - 1, tokenEnd), ...noteToken });
			events.push({
				kind: 'dead-note',
				string,
				digits: 'x',
				column: measureColumn,
				joinedToPrevious
			});
			measureColumn += 1;
			consumedEnd = tokenEnd;
			previousEventEnd = tokenEnd;
			previousFrettedNote = undefined;
			return true;
		};

		let index = 0;
		while (index < lineText.length) {
			if (/\s/.test(lineText[index])) {
				index++;
				continue;
			}

			const start = index;
			const char = lineText[start];
			const currentSpan = span(start, start + 1);

			if (char === '|') {
				consumeGap(start);
				sourceTokens.push({ kind: 'bar', ...currentSpan });
				closeMeasure(start, true);
				index++;
				continue;
			}

			consumeGap(start);

			const canAttachToPrevious =
				previousFrettedNote !== undefined && previousFrettedNote.end === start;
			const postfixTechnique =
				POSTFIX_TECHNIQUES[char] && !(hasNoteAtom(start + 1) && stringIndex.has(char.toUpperCase()))
					? POSTFIX_TECHNIQUES[char]
					: undefined;
			if (postfixTechnique) {
				if (!canAttachToPrevious) {
					addInvalid(start, start + 1, `Articulation "${char}" needs a preceding note`);
					index = start + 1;
					continue;
				}
				const previous = previousFrettedNote;
				if (!previous) throw new Error('Internal parser error: missing note for articulation');
				features.articulations = true;
				sourceTokens.push({ kind: 'technique', ...currentSpan, note: previous.note });
				events.push({
					kind: 'technique',
					technique: postfixTechnique,
					string: previous.event.string,
					symbol: char,
					column: measureColumn
				});
				measureColumn += 1;
				consumedEnd = start + 1;
				previousEventEnd = start + 1;
				previous.end = start + 1;
				index = start + 1;
				continue;
			}

			const connectorTechnique = CONNECTOR_TECHNIQUES[char];
			if (connectorTechnique) {
				if (!canAttachToPrevious) {
					const target = readFret(start + 1);
					const end = target?.tokenEnd ?? start + 1;
					addInvalid(start, end, `Articulation "${char}" needs a preceding note`);
					index = end;
					continue;
				}
				const target = readFret(start + 1);
				if (!target) {
					sourceTokens.push({ kind: 'invalid', ...currentSpan });
					errors.push({
						...position(start, 1),
						message: `Articulation "${char}" needs a target fret`
					});
					measureColumn += 1;
					consumedEnd = start + 1;
					previousEventEnd = start + 1;
					previousFrettedNote = undefined;
					index = start + 1;
					continue;
				}
				const previous = previousFrettedNote;
				if (!previous) throw new Error('Internal parser error: missing note for articulation');
				features.articulations = true;
				sourceTokens.push({ kind: 'technique', ...currentSpan, note: previous.note });
				events.push({
					kind: 'technique',
					technique: connectorTechnique,
					string: previous.event.string,
					symbol: char,
					column: measureColumn
				});
				measureColumn += 1;
				consumedEnd = start + 1;
				previousEventEnd = start + 1;
				addFrettedNote(
					start + 1,
					target.fretStart,
					target.tokenEnd,
					undefined,
					target.digits,
					true,
					{ stringOverride: previous.event.string }
				);
				index = target.tokenEnd;
				continue;
			}

			let letter: string | undefined;
			let noteStart = start;
			if (/[A-Za-z]/.test(char) && hasNoteAtom(start + 1)) {
				letter = char;
				noteStart = start + 1;
			}

			const joinedToPrevious = previousEventEnd !== -1 && start === previousEventEnd;
			if (lineText[noteStart] === 'x') {
				if (syntaxVersion === 1) {
					const end = invalidRunEnd(start);
					addInvalid(start, end, `Unrecognised token "${lineText.slice(start, end)}"`);
					index = end;
					continue;
				}
				if (!/[\s|]/.test(lineText[noteStart + 1] ?? ' ')) {
					const end = invalidRunEnd(start);
					addInvalid(start, end, `Unrecognised token "${lineText.slice(start, end)}"`);
					index = end;
					continue;
				}
				addDeadNote(start, noteStart + 1, letter, joinedToPrevious);
				index = noteStart + 1;
				continue;
			}

			if (syntaxVersion === 1 && /\d/.test(lineText[noteStart] ?? '')) {
				const digitRun = /^\d+/.exec(lineText.slice(noteStart))?.[0] ?? '';
				const splitPrefixedRun = letter !== undefined && digitRun.length >= 3;
				const splitBareRun = !letter && start < splitLegacyDigitsEnd;
				const digits = splitPrefixedRun || splitBareRun ? digitRun[0] : digitRun;
				if (splitPrefixedRun) splitLegacyDigitsEnd = noteStart + digitRun.length;
				addFrettedNote(
					start,
					noteStart,
					noteStart + digits.length,
					letter,
					digits,
					joinedToPrevious
				);
				index = noteStart + digits.length;
				continue;
			}

			const ghost = readGhostFret(noteStart);
			if (ghost && syntaxVersion !== 1) {
				addFrettedNote(
					start,
					ghost.fretStart,
					ghost.tokenEnd,
					letter,
					ghost.digits,
					joinedToPrevious,
					{
						ghost: true,
						display: `(${ghost.digits})`,
						fretEnd: ghost.fretEnd
					}
				);
				index = ghost.tokenEnd;
				continue;
			}

			const fret = readFret(noteStart);
			if (fret) {
				addFrettedNote(start, fret.fretStart, fret.tokenEnd, letter, fret.digits, joinedToPrevious);
				index = fret.tokenEnd;
				continue;
			}

			const end = invalidRunEnd(start);
			addInvalid(start, end, `Unrecognised token "${lineText.slice(start, end)}"`);
			index = end;
		}

		closeMeasure(lineText.length, false);
		if (measures.length > 0) {
			const system: System = { kind: 'system', measures };
			systems.push(system);
			blocks.push(system);
		}
	});

	return { systems, blocks, errors, tokens: sourceTokens, features };
}

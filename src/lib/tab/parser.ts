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
	/** Explicit rhythmic length for the note group when the bar opts into rhythm. */
	duration?: RhythmDuration;
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
	/** Explicit rhythmic length for the silent slot when the bar opts into rhythm. */
	duration?: RhythmDuration;
}

export type DurationCode = 'w' | 'h' | 'q' | 'e' | 's';

export interface RhythmDuration {
	code: DurationCode;
	dotted: boolean;
	/** Length in bars. A quarter note in 4/4 is 0.25. */
	bars: number;
}

export interface RestEvent {
	kind: 'rest';
	string?: never;
	fret?: never;
	digits?: never;
	column?: never;
	joinedToPrevious?: never;
	/** Rests consume time in marked bars but occupy no rendered tab columns. */
	duration: RhythmDuration;
}

/** One rhythmic column in the tab. Kept as a union so new indicators can be added later. */
export type TabEvent = NoteEvent | TechniqueEvent | DeadNoteEvent | RestEvent;

export interface Measure {
	events: TabEvent[];
	/** Exact number of columns written between the bar lines (or row boundaries). */
	width: number;
	/** True when any duration or rest marker opts this bar into explicit timing. */
	timed?: boolean;
	/** True when this measure starts a repeated phrase. */
	repeatStart?: boolean;
	/** Repeat count when this measure ends a repeated phrase. */
	repeatEnd?: { count: number };
	/** Source position of the repeat start marker, used for validation diagnostics. */
	repeatStartPosition?: SourcePosition;
	/** Source position of the repeat end marker, used for validation diagnostics. */
	repeatEndPosition?: SourcePosition;
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

export interface TempoMarker {
	kind: 'tempo';
	bpm: number;
}

export type TabBlock = System | Section | Annotation | TempoMarker;

export interface ParseError {
	message: string;
	/** 1-based line number in the source. */
	line: number;
	/** 1-based column in the source. */
	column: number;
	length: number;
}

export interface SourcePosition extends ParseError {
	/** 0-based offset into the source (inclusive). */
	start: number;
	/** 0-based offset into the source (exclusive). */
	end: number;
}

export type SourceTokenKind =
	| 'string'
	| 'fret'
	| 'technique'
	| 'duration'
	| 'rest'
	| 'bar'
	| 'repeat'
	| 'tempo'
	| 'section'
	| 'comment'
	| 'invalid';

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
		rhythm: boolean;
		repeats: boolean;
		tempo: boolean;
	};
}

const CONNECTOR_TECHNIQUES: Record<string, TechniqueKind> = {
	h: 'hammer-on',
	p: 'pull-off',
	'/': 'slide-up',
	'\\': 'slide-down'
};
const POSTFIX_TECHNIQUES: Record<string, TechniqueKind> = { b: 'bend', '~': 'vibrato' };

const DURATION_BARS: Record<DurationCode, number> = {
	w: 1,
	h: 1 / 2,
	q: 1 / 4,
	e: 1 / 8,
	s: 1 / 16
};

const DEFAULT_DURATION = durationFor('q', false);

function durationFor(code: DurationCode, dotted: boolean): RhythmDuration {
	return { code, dotted, bars: DURATION_BARS[code] * (dotted ? 1.5 : 1) };
}

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
	const features = { articulations: false, rhythm: false, repeats: false, tempo: false };
	let currentString: number | undefined;
	let noteCount = 0;
	let lineOffset = 0;
	const allMeasures: Measure[] = [];

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
		if (trimmed.startsWith('@')) {
			const match = /^@(\d+)$/.exec(trimmed);
			if (!match) {
				sourceTokens.push({ kind: 'invalid', ...trimmedSpan });
				errors.push({
					line: lineIdx + 1,
					column: lineText.indexOf('@') + 1,
					length: trimmed.length,
					message: 'Tempo marker must be written as @120'
				});
				return;
			}
			const bpm = Number(match[1]);
			if (!Number.isInteger(bpm) || bpm < 30 || bpm > 300) {
				sourceTokens.push({ kind: 'invalid', ...trimmedSpan });
				errors.push({
					line: lineIdx + 1,
					column: lineText.indexOf('@') + 1,
					length: trimmed.length,
					message: 'Tempo marker BPM must be between 30 and 300'
				});
				return;
			}
			features.tempo = true;
			blocks.push({ kind: 'tempo', bpm });
			sourceTokens.push({ kind: 'tempo', ...trimmedSpan });
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
		let measureHasRhythm = false;
		let currentDuration = DEFAULT_DURATION;
		let rhythmSlots: { duration: RhythmDuration; start: number; length: number }[] = [];
		let pendingRepeatStart: SourcePosition | undefined;
		let pendingRepeatEnd: { count: number; position: SourcePosition } | undefined;
		// End index (0-based, exclusive) in lineText of the previously emitted note, used to
		// detect notes written back-to-back with no whitespace between them. Reset whenever a
		// measure ends, since joining never crosses a bar line.
		let previousEventEnd = -1;
		let previousFrettedNote: { event: NoteEvent; note: number; end: number } | undefined;
		let splitLegacyDigitsEnd = -1;

		const closeMeasure = (end: number, explicit: boolean, delimiterLength = 1) => {
			if (!explicit && end > consumedEnd) measureColumn += end - consumedEnd;
			if (measureHasRhythm) {
				let total = 0;
				const overflow = rhythmSlots.find((slot) => {
					total += slot.duration.bars;
					return total > 1 + Number.EPSILON;
				});
				if (overflow) {
					sourceTokens.push({
						kind: 'invalid',
						...span(overflow.start, overflow.start + overflow.length)
					});
					errors.push({
						...position(overflow.start, overflow.length),
						message: 'Rhythm durations exceed one 4/4 bar'
					});
				}
			}
			if (events.length > 0 || (openingBar && measureColumn > 0)) {
				const measure: Measure = {
					events,
					width: measureColumn,
					...(measureHasRhythm ? { timed: true } : {}),
					...(pendingRepeatStart
						? { repeatStart: true, repeatStartPosition: pendingRepeatStart }
						: {}),
					...(pendingRepeatEnd
						? {
								repeatEnd: { count: pendingRepeatEnd.count },
								repeatEndPosition: pendingRepeatEnd.position
							}
						: {})
				};
				measures.push(measure);
				allMeasures.push(measure);
			}
			events = [];
			measureColumn = 0;
			consumedEnd = end + (explicit ? delimiterLength : 0);
			measureHasRhythm = false;
			currentDuration = DEFAULT_DURATION;
			rhythmSlots = [];
			pendingRepeatStart = undefined;
			pendingRepeatEnd = undefined;
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
		const sourcePosition = (start: number, end: number, message = ''): SourcePosition => ({
			...position(start, end - start),
			start: offset + start,
			end: offset + end,
			message
		});
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
		const readRhythmMarker = (
			start: number
		):
			| { kind: 'duration'; duration: RhythmDuration; tokenEnd: number }
			| { kind: 'rest'; duration?: RhythmDuration; tokenEnd: number }
			| null => {
			if (lineText[start] !== ':') return null;
			const marker = lineText[start + 1];
			if (marker === 'r') {
				const restCode = lineText[start + 2];
				if (restCode && restCode in DURATION_BARS) {
					const dotted = lineText[start + 3] === '.';
					return {
						kind: 'rest',
						duration: durationFor(restCode as DurationCode, dotted),
						tokenEnd: start + (dotted ? 4 : 3)
					};
				}
				return { kind: 'rest', tokenEnd: start + 2 };
			}
			if (marker && marker in DURATION_BARS) {
				const dotted = lineText[start + 2] === '.';
				return {
					kind: 'duration',
					duration: durationFor(marker as DurationCode, dotted),
					tokenEnd: start + (dotted ? 3 : 2)
				};
			}
			return null;
		};
		const readRepeatEnd = (
			start: number
		): { count: number; tokenEnd: number; error?: ParseError } | null => {
			if (lineText[start] !== ':' || lineText[start + 1] !== '|') return null;
			let tokenEnd = start + 2;
			let count = 2;
			let cursor = tokenEnd;
			while (/\s/.test(lineText[cursor] ?? '')) cursor++;
			if (lineText[cursor] === 'x') {
				const countStart = cursor;
				cursor++;
				const digits = /^\d+/.exec(lineText.slice(cursor))?.[0] ?? '';
				tokenEnd = cursor + digits.length;
				count = Number(digits);
				if (!digits || !Number.isSafeInteger(count) || count < 2) {
					const end = digits ? tokenEnd : countStart + 1;
					return {
						count: 2,
						tokenEnd: end,
						error: {
							...position(countStart, end - countStart),
							message: 'Repeat count must be x2 or greater'
						}
					};
				}
			}
			return { count, tokenEnd };
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
			if (measureHasRhythm && !joinedToPrevious) event.duration = currentDuration;
			events.push(event);
			if (!joinedToPrevious) {
				rhythmSlots.push({ duration: currentDuration, start, length: tokenEnd - start });
			}
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
			const event: DeadNoteEvent = {
				kind: 'dead-note',
				string,
				digits: 'x',
				column: measureColumn,
				joinedToPrevious
			};
			if (measureHasRhythm && !joinedToPrevious) event.duration = currentDuration;
			events.push(event);
			if (!joinedToPrevious) {
				rhythmSlots.push({ duration: currentDuration, start, length: tokenEnd - start });
			}
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

			const afterBarColon = lineText[start + 2];
			const colonAfterBarStartsRhythm =
				lineText[start + 1] === ':' &&
				(afterBarColon === 'r' || (afterBarColon !== undefined && afterBarColon in DURATION_BARS));
			if (char === '|' && lineText[start + 1] === ':' && !colonAfterBarStartsRhythm) {
				consumeGap(start);
				sourceTokens.push({ kind: 'repeat', ...span(start, start + 2) });
				features.repeats = true;
				closeMeasure(start, true, 2);
				pendingRepeatStart = sourcePosition(start, start + 2);
				consumedEnd = start + 2;
				index = start + 2;
				continue;
			}

			if (char === '|') {
				consumeGap(start);
				sourceTokens.push({ kind: 'bar', ...currentSpan });
				closeMeasure(start, true);
				index++;
				continue;
			}

			consumeGap(start);

			if (char === ':') {
				const repeatEnd = readRepeatEnd(start);
				if (repeatEnd) {
					if (repeatEnd.error) {
						sourceTokens.push({ kind: 'invalid', ...span(start, repeatEnd.tokenEnd) });
						errors.push(repeatEnd.error);
						pendingRepeatEnd = {
							count: 2,
							position: sourcePosition(start, start + 2)
						};
						closeMeasure(start, true, repeatEnd.tokenEnd - start);
						index = repeatEnd.tokenEnd;
						continue;
					}
					sourceTokens.push({ kind: 'repeat', ...span(start, repeatEnd.tokenEnd) });
					features.repeats = true;
					pendingRepeatEnd = {
						count: repeatEnd.count,
						position: sourcePosition(start, repeatEnd.tokenEnd)
					};
					closeMeasure(start, true, repeatEnd.tokenEnd - start);
					index = repeatEnd.tokenEnd;
					continue;
				}
				const marker = readRhythmMarker(start);
				if (!marker) {
					const end = invalidRunEnd(start);
					addInvalid(start, end, `Invalid rhythm marker "${lineText.slice(start, end)}"`);
					index = end;
					continue;
				}
				features.rhythm = true;
				measureHasRhythm = true;
				if (marker.kind === 'duration') {
					currentDuration = marker.duration;
					sourceTokens.push({ kind: 'duration', ...span(start, marker.tokenEnd) });
				} else {
					const duration = marker.duration ?? currentDuration;
					sourceTokens.push({ kind: 'rest', ...span(start, marker.tokenEnd) });
					events.push({ kind: 'rest', duration });
					rhythmSlots.push({ duration, start, length: marker.tokenEnd - start });
				}
				consumedEnd = marker.tokenEnd;
				previousEventEnd = -1;
				previousFrettedNote = undefined;
				index = marker.tokenEnd;
				continue;
			}

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

	let openRepeat: Measure | undefined;
	for (const measure of allMeasures) {
		if (measure.repeatStart) {
			if (openRepeat) {
				const position = measure.repeatStartPosition;
				if (position) {
					sourceTokens.push({ kind: 'invalid', start: position.start, end: position.end });
					errors.push({
						line: position.line,
						column: position.column,
						length: position.length,
						message: 'Nested repeats are not supported'
					});
				}
			} else {
				openRepeat = measure;
			}
		}
		if (measure.repeatEnd) {
			if (!openRepeat) {
				const position = measure.repeatEndPosition;
				if (position) {
					sourceTokens.push({ kind: 'invalid', start: position.start, end: position.end });
					errors.push({
						line: position.line,
						column: position.column,
						length: position.length,
						message: 'Repeat end ":|" has no matching "|:"'
					});
				}
			} else {
				openRepeat = undefined;
			}
		}
	}
	if (openRepeat?.repeatStartPosition) {
		const position = openRepeat.repeatStartPosition;
		sourceTokens.push({ kind: 'invalid', start: position.start, end: position.end });
		errors.push({
			line: position.line,
			column: position.column,
			length: position.length,
			message: 'Repeat start "|:" has no matching ":|"'
		});
	}

	sourceTokens.sort((a, b) => {
		if (a.start !== b.start) return a.start - b.start;
		if (a.kind === 'invalid' && b.kind !== 'invalid') return -1;
		if (a.kind !== 'invalid' && b.kind === 'invalid') return 1;
		return b.end - a.end;
	});

	return { systems, blocks, errors, tokens: sourceTokens, features };
}

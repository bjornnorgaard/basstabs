import { parse, type System, type TabBlock } from './parser';
import type { Tuning } from './tuning';

const FILL = '-';
const BAR = '|';

/**
 * Splits a measure's events into runs of notes that were written back-to-back with no
 * whitespace between them (see `NoteEvent.joinedToPrevious`). Playback uses the runs
 * to schedule quickly successive notes within one slot.
 */
export function groupJoinedEvents<T extends { joinedToPrevious: boolean }>(events: T[]): T[][] {
	const groups: T[][] = [];
	for (const event of events) {
		const previousGroup = groups[groups.length - 1];
		if (event.joinedToPrevious && previousGroup) {
			previousGroup.push(event);
		} else {
			groups.push([event]);
		}
	}
	return groups;
}

/** A note placed in the rendered output. */
export interface NoteLayout {
	/** Unique across the whole layout, in playing order. */
	id: number;
	string: number;
	fret?: number;
	digits: string;
	display?: string;
	ghost?: boolean;
	dead?: boolean;
	joinedToPrevious: boolean;
	/** 0-based column of the note's first digit within its row's lines. */
	column: number;
	width: number;
}

export interface TimingSlot {
	notes: NoteLayout[];
	/** Length in bars. A quarter note in 4/4 is 0.25. */
	duration: number;
}

export interface MeasureLayout {
	/** Unique across the whole layout, in playing order. */
	id: number;
	/** 0-based column of the first character after the opening bar line. */
	column: number;
	/** Number of characters between the surrounding bar lines. */
	width: number;
	notes: NoteLayout[];
	/** True when this bar uses explicit rhythm markers instead of legacy even spacing. */
	timed?: boolean;
	/** Timed note/rest slots in source order. Empty notes represent rests or silent dead-note slots. */
	timingSlots: TimingSlot[];
}

/** A run of characters on one rendered line; notes get their own segment so they can be highlighted. */
export interface LineSegment {
	text: string;
	noteId?: number;
	class?: string;
	multiDigit?: boolean;
}

export interface SystemLine {
	/** Index into `tuning.strings`. Lines are ordered from highest to lowest string. */
	string: number;
	text: string;
	segments: LineSegment[];
}

export interface SystemLayout {
	kind: 'system';
	/** Index of this row among all rows, in order. */
	index: number;
	/** Index of the section this row belongs to, if any. */
	section?: number;
	lines: SystemLine[];
	measures: MeasureLayout[];
}

export interface SectionLayout {
	kind: 'section';
	/** Index of this section among all sections, in order. */
	index: number;
	title: string;
	text: string;
}

export interface AnnotationLayout {
	kind: 'annotation';
	text: string;
}

export type BlockLayout = SystemLayout | SectionLayout | AnnotationLayout;

export interface TabLayout {
	blocks: BlockLayout[];
	/** All measures in playing order. */
	measures: MeasureLayout[];
	text: string;
}

function layoutSystem(
	system: System,
	tuning: Tuning,
	counters: { note: number; measure: number }
): Omit<SystemLayout, 'index' | 'section'> {
	const nameWidth = Math.max(...tuning.strings.map((s) => s.length));
	let column = nameWidth + BAR.length;

	const measures: MeasureLayout[] = system.measures.map((measure) => {
		const start = column;
		const notes: NoteLayout[] = [];
		const timingSlots: TimingSlot[] = [];
		for (const event of measure.events) {
			if (event.kind === 'technique') continue;
			if (event.kind === 'rest') {
				timingSlots.push({ notes: [], duration: event.duration.bars });
				continue;
			}
			const text = event.kind === 'dead-note' ? event.digits : (event.display ?? event.digits);
			const note = {
				id: counters.note++,
				string: event.string,
				fret: event.kind === 'note' ? event.fret : undefined,
				digits: event.digits,
				display: event.kind === 'note' ? event.display : undefined,
				ghost: event.kind === 'note' ? event.ghost : undefined,
				dead: event.kind === 'dead-note' ? true : undefined,
				joinedToPrevious: event.joinedToPrevious,
				column: start + event.column,
				width: text.length
			};
			notes.push(note);
			if (event.joinedToPrevious && timingSlots.length > 0) {
				timingSlots[timingSlots.length - 1].notes.push(note);
			} else {
				timingSlots.push({ notes: [note], duration: event.duration?.bars ?? 1 / 4 });
			}
		}
		const layout = {
			id: counters.measure++,
			column: start,
			width: measure.width,
			notes,
			...(measure.timed ? { timed: true } : {}),
			timingSlots
		};
		column += measure.width + BAR.length;
		return layout;
	});

	const lineLength = column;
	const notesByMeasure = measures.map((measure) => measure.notes);
	const allNotes = notesByMeasure.flat();
	const lines = tuning.strings
		.map((name, string) => {
			const segments: LineSegment[] = [{ text: name.padEnd(nameWidth) + BAR }];
			let cursor = segments[0].text.length;
			const fillTo = (target: number) => {
				let text = '';
				while (cursor < target) {
					const atBar = measures.some((m) => cursor === m.column + m.width);
					text += atBar ? BAR : FILL;
					cursor++;
				}
				if (text) segments.push({ text });
			};
			let nextNote = 0;
			for (const [measureIndex, measure] of system.measures.entries()) {
				const measureStart = measures[measureIndex].column;
				let lastNoteId: number | undefined;
				for (const event of measure.events) {
					if (event.kind === 'rest') continue;
					if (event.string !== string) {
						if (event.kind !== 'technique') nextNote++;
						continue;
					}
					if (event.kind === 'technique') {
						fillTo(measureStart + event.column);
						segments.push({ text: event.symbol, noteId: lastNoteId, class: 'hl-technique' });
						cursor += event.symbol.length;
						continue;
					}
					const note = allNotes[nextNote];
					nextNote++;
					lastNoteId = note.id;
					fillTo(note.column);
					const text = note.display ?? note.digits;
					const segment: LineSegment = { text, noteId: note.id };
					if (note.digits.length > 1) segment.multiDigit = true;
					if (note.dead) segment.class = 'hl-technique';
					segments.push(segment);
					cursor += note.width;
				}
			}
			fillTo(lineLength);
			return { string, text: segments.map((s) => s.text).join(''), segments };
		})
		.reverse();

	return { kind: 'system', lines, measures };
}

/** Lays out parsed blocks as positioned text, keeping track of where every note and bar ends up. */
export function layoutBlocks(blocks: TabBlock[], tuning: Tuning): TabLayout {
	const counters = { note: 0, measure: 0 };
	let systemIndex = 0;
	let sectionIndex = -1;

	const layouts: BlockLayout[] = blocks.map((block) => {
		if (block.kind === 'system') {
			return {
				...layoutSystem(block, tuning, counters),
				index: systemIndex++,
				section: sectionIndex >= 0 ? sectionIndex : undefined
			};
		}
		if (block.kind === 'section') {
			sectionIndex++;
			return { kind: 'section', index: sectionIndex, title: block.title, text: `[${block.title}]` };
		}
		return { kind: 'annotation', text: `#${block.text ? ` ${block.text}` : ''}` };
	});

	const text = layouts
		.map((block, index) => {
			const previous = layouts[index - 1];
			const separator = previous?.kind === 'system' ? '\n\n' : previous ? '\n' : '';
			const body = block.kind === 'system' ? block.lines.map((l) => l.text).join('\n') : block.text;
			return separator + body;
		})
		.join('');

	const measures = layouts.flatMap((b) => (b.kind === 'system' ? b.measures : []));
	return { blocks: layouts, measures, text };
}

export function renderSystem(system: System, tuning: Tuning): string {
	return layoutBlocks([system], tuning).text;
}

export function renderSystems(systems: System[], tuning: Tuning): string {
	return systems.map((s) => renderSystem(s, tuning)).join('\n\n');
}

export function renderBlocks(blocks: TabBlock[], tuning: Tuning): string {
	return layoutBlocks(blocks, tuning).text;
}

/** Parse and render in one go. */
export function renderTab(source: string, tuning: Tuning) {
	const { blocks, errors, tokens } = parse(source, tuning);
	const layout = layoutBlocks(blocks, tuning);
	return { text: layout.text, layout, errors, tokens };
}

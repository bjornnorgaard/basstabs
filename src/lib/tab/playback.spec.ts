import { describe, expect, it } from 'vitest';
import { buildSchedule, midiToFrequency } from './playback';
import { renderTab } from './render';
import { getTuning } from './tuning';

const bass4 = getTuning('standard-4');
const bass5 = getTuning('standard-5');

describe('layout', () => {
	it('records where every note and bar sits in the rendered text', () => {
		const { layout } = renderTab('E0 [12] |A2E320', bass4);
		const lines = layout.text.split('\n');
		const eLine = lines[3];

		const [first, second] = layout.measures;
		expect(first).toMatchObject({ id: 0, column: 2, width: 5 });
		expect(second).toMatchObject({ id: 1, column: 8, width: 4 });
		expect(eLine[first.column - 1]).toBe('|');
		expect(eLine[first.column + first.width]).toBe('|');

		for (const note of layout.measures.flatMap((m) => m.notes)) {
			const line = lines[bass4.strings.length - 1 - note.string];
			expect(line.slice(note.column, note.column + note.width)).toBe(note.digits);
		}
		expect(layout.measures.flatMap((m) => m.notes).map((n) => n.id)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('splits lines into segments that rebuild the text and tag notes', () => {
		const { layout } = renderTab('E0 0 A2 2 |E0 0 3 A2 |', bass4);
		const system = layout.blocks[0];
		if (system.kind !== 'system') throw new Error('expected a system');

		expect(system.lines.map((l) => l.string)).toEqual([3, 2, 1, 0]);
		for (const line of system.lines) {
			expect(line.segments.map((s) => s.text).join('')).toBe(line.text);
		}
		expect(system.lines[3].segments.filter((s) => s.noteId !== undefined)).toEqual([
			{ text: '0', noteId: 0 },
			{ text: '0', noteId: 1 },
			{ text: '0', noteId: 4 },
			{ text: '0', noteId: 5 },
			{ text: '3', noteId: 6 }
		]);
	});

	it('numbers rows and sections and links rows to their section', () => {
		const { layout } = renderTab('E0 |\n[Verse]\n# soft\nE1 |\nE2 |\n[Chorus]\nE3 |', bass4);
		const summary = layout.blocks.map((b) =>
			b.kind === 'system' ? `row${b.index}@${b.section ?? '-'}` : `${b.kind}`
		);
		expect(summary).toEqual([
			'row0@-',
			'section',
			'annotation',
			'row1@0',
			'row2@0',
			'section',
			'row3@1'
		]);
	});
});

describe('buildSchedule', () => {
	it.each([
		{
			name: 'the README example',
			source: 'E0 0 A2 2 |E0 0 3 A2 |',
			expected: [
				[28, 0, 0.25, 0],
				[28, 0.25, 0.25, 0],
				[35, 0.5, 0.25, 0],
				[35, 0.75, 0.25, 0],
				[28, 1, 0.25, 1],
				[28, 1.25, 0.25, 1],
				[31, 1.5, 0.25, 1],
				[35, 1.75, 0.25, 1]
			]
		},
		{
			name: 'joined notes and spacing',
			source: '|E4320|A2      |E1         |',
			expected: [
				[32, 0, 0.25, 0],
				[31, 0.25, 0.25, 0],
				[30, 0.5, 0.25, 0],
				[28, 0.75, 0.25, 0],
				[35, 1, 1, 1],
				[29, 2, 1, 2]
			]
		},
		{
			name: 'articulations and dead notes',
			source: String.raw`E5h7 E5b E(5) Ex |`,
			expected: [
				[33, 0, 0.125, 0],
				[35, 0.125, 0.125, 0],
				[33, 0.25, 0.25, 0],
				[33, 0.5, 0.25, 0]
			]
		},
		{
			name: 'blank bars',
			source: '|    |E1|',
			expected: [[29, 1, 1, 1]]
		},
		{
			name: 'multi-row tabs and sections',
			source: '[Verse]\nE0 | E1 |\n# soft\nA2E320 |',
			expected: [
				[28, 0, 1, 0],
				[29, 1, 1, 1],
				[35, 2, 0.25, 2],
				[31, 2.25, 0.25, 2],
				[30, 2.5, 0.25, 2],
				[28, 2.75, 0.25, 2]
			]
		}
	])('keeps unmarked playback unchanged for $name', ({ source, expected }) => {
		const { layout, errors } = renderTab(source, bass4);
		expect(errors).toEqual([]);
		const { notes } = buildSchedule(layout.measures, bass4);
		expect(notes.map((note) => [note.midi, note.start, note.length, note.measureId])).toEqual(
			expected
		);
	});

	it('gives every bar the same length and splits it evenly between columns', () => {
		const { layout } = renderTab('E0 0 A2 2 | E5 |', bass4);
		const { notes, length } = buildSchedule(layout.measures, bass4);

		expect(length).toBe(2);
		expect(notes.map((n) => [n.start, n.length])).toEqual([
			[0, 0.25],
			[0.25, 0.25],
			[0.5, 0.25],
			[0.75, 0.25],
			[1, 1]
		]);
		expect(notes.map((n) => n.midi)).toEqual([28, 28, 35, 35, 33]);
		expect(notes.map((n) => n.measureId)).toEqual([0, 0, 0, 0, 1]);
	});

	it('lets joined notes share a single column slot', () => {
		const { layout } = renderTab('A2 E320 |', bass4);
		const { notes } = buildSchedule(layout.measures, bass4);

		expect(notes.map((n) => n.start)).toEqual([0, 0.5, 0.5 + 1 / 6, 0.5 + 2 / 6]);
		expect(notes.slice(1).every((n) => n.length === 1 / 6)).toBe(true);
	});

	it('starts a selection of bars at zero', () => {
		const { layout } = renderTab('E0 | E1 | B2 |', bass5);
		const { notes, length } = buildSchedule(layout.measures.slice(1), bass5);

		expect(length).toBe(2);
		expect(notes.map((n) => [n.start, n.midi])).toEqual([
			[0, 29],
			[1, 25]
		]);
	});

	it('keeps a fully blank bar in the schedule without adding notes', () => {
		const { layout } = renderTab('|    |E1|', bass4);
		const { notes, length } = buildSchedule(layout.measures, bass4);
		expect(length).toBe(2);
		expect(notes.map((note) => note.start)).toEqual([1]);
	});

	it('plays connector targets and ghost notes as plain notes while dead notes are silent slots', () => {
		const { layout } = renderTab('E5h7 E5b E(5) Ex |', bass4);
		const { notes, length } = buildSchedule(layout.measures, bass4);
		expect(length).toBe(1);
		expect(notes.map((note) => [note.midi, note.start, note.length])).toEqual([
			[33, 0, 0.125],
			[35, 0.125, 0.125],
			[33, 0.25, 0.25],
			[33, 0.5, 0.25]
		]);
		expect(notes.some((note) => note.noteId === layout.measures[0].notes[4].id)).toBe(false);
	});

	it('uses explicit durations and rests in marked bars', () => {
		const { layout, errors } = renderTab(':q E0 0 :e 0 :r 0 |', bass4);
		expect(errors).toEqual([]);
		const { notes, length } = buildSchedule(layout.measures, bass4);
		expect(length).toBe(1);
		expect(notes.map((note) => [note.midi, note.start, note.length])).toEqual([
			[28, 0, 0.25],
			[28, 0.25, 0.25],
			[28, 0.5, 0.125],
			[28, 0.75, 0.125]
		]);
	});

	it('supports dotted explicit durations', () => {
		const { layout, errors } = renderTab(':q. E0 :e 0 |', bass4);
		expect(errors).toEqual([]);
		const { notes } = buildSchedule(layout.measures, bass4);
		expect(notes.map((note) => [note.start, note.length])).toEqual([
			[0, 0.375],
			[0.375, 0.125]
		]);
	});

	it('lets joined notes subdivide one explicit duration slot', () => {
		const { layout, errors } = renderTab(':h E320 :h A2 |', bass4);
		expect(errors).toEqual([]);
		const { notes } = buildSchedule(layout.measures, bass4);
		expect(notes.map((note) => [note.midi, note.start, note.length])).toEqual([
			[31, 0, 1 / 6],
			[30, 1 / 6, 1 / 6],
			[28, 2 / 6, 1 / 6],
			[35, 0.5, 0.5]
		]);
	});

	it('keeps unmarked bars on legacy even spacing beside marked bars', () => {
		const { layout, errors } = renderTab('E0 0 0 0 | :h E0 :e 0 0 |', bass4);
		expect(errors).toEqual([]);
		const { notes } = buildSchedule(layout.measures, bass4);
		expect(notes.map((note) => [note.start, note.length])).toEqual([
			[0, 0.25],
			[0.25, 0.25],
			[0.5, 0.25],
			[0.75, 0.25],
			[1, 0.5],
			[1.5, 0.125],
			[1.625, 0.125]
		]);
	});

	it('converts MIDI notes to frequencies', () => {
		expect(midiToFrequency(69)).toBe(440);
		expect(midiToFrequency(28)).toBeCloseTo(41.2, 1);
	});
});

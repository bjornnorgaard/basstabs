import { describe, expect, it } from 'vitest';
import { EXAMPLE_SOURCE } from './example';
import { parse } from './parser';
import { buildSchedule } from './playback';
import { renderTab } from './render';
import { TUNINGS, getTuning } from './tuning';

describe('new tab example', () => {
	it.each(TUNINGS)('is valid for $label', (tuning) => {
		expect(parse(EXAMPLE_SOURCE, tuning).errors).toEqual([]);
	});

	it.each(TUNINGS)('ignores string-name casing for $label', (tuning) => {
		const upper = tuning.strings.map((name) => `${name}0 2`).join(' ') + '|';
		const lower = upper.toLowerCase();
		const mixed =
			tuning.strings.map((name, i) => `${i % 2 ? name.toLowerCase() : name}0 2`).join(' ') + '|';
		const expected = parse(upper, tuning);
		expect(expected.errors).toEqual([]);
		for (const source of [lower, mixed]) {
			expect(parse(source, tuning)).toEqual(expected);
			expect(renderTab(source, tuning)).toEqual(renderTab(upper, tuning));
		}
	});

	it('walks through the syntax with sections and uppercase string names', () => {
		const tuning = getTuning('standard-4');
		const { blocks, systems, tokens } = parse(EXAMPLE_SOURCE, tuning);
		expect(EXAMPLE_SOURCE).toContain('\n\n# Newlines start a new row of tab.');
		expect(blocks.filter((block) => block.kind === 'section').map((block) => block.title)).toEqual([
			'C Major Scale',
			'Strings and Frets',
			'Spacing and Silence',
			'Joined Notes',
			'Higher Frets',
			'Articulations',
			'Bar Lines and Rows',
			'Rhythm and Rests',
			'Verse',
			'Try the Features'
		]);
		expect(systems).toHaveLength(10);
		expect(new Set(tokens.map((token) => token.kind))).toEqual(
			new Set(['section', 'comment', 'bar', 'string', 'fret', 'technique', 'duration', 'rest'])
		);
		for (const token of tokens.filter((token) => token.kind === 'string')) {
			const name = EXAMPLE_SOURCE.slice(token.start, token.end);
			expect(name).toBe(name.toUpperCase());
		}
	});

	it.each(TUNINGS)('plays an ascending C major scale for $label', (tuning) => {
		const { systems } = parse(EXAMPLE_SOURCE, tuning);
		const pitches = systems[0].measures[0].events.map((note) => {
			if (note.kind !== 'note') throw new Error('Expected only notes in the scale example');
			return tuning.openMidi[note.string] + note.fret;
		});
		expect(pitches).toEqual([36, 38, 40, 41, 43, 45, 47, 48]);
	});

	it('demonstrates visual spacing, silent bars, joined notes, and higher frets', () => {
		const tuning = getTuning('standard-4');
		const { systems } = parse(EXAMPLE_SOURCE, tuning);
		const spacing = systems[2].measures;
		expect(spacing.map((measure) => measure.width)).toEqual([7, 12, 4]);
		expect(spacing[0].events.map((note) => note.column)).toEqual([0, 2, 4, 6]);
		expect(spacing[1].events.map((note) => note.column)).toEqual([0, 3, 6, 9]);
		expect(spacing[2].events).toEqual([]);
		const joined = systems[3].measures;
		expect(joined.map((measure) => measure.events.map((note) => note.fret))).toEqual([
			[2, 3, 2, 0],
			[2, 3, 2, 0]
		]);
		expect(joined[0].events.map((note) => note.joinedToPrevious)).toEqual([
			false,
			true,
			true,
			true
		]);
		expect(joined[1].events.every((note) => !note.joinedToPrevious)).toBe(true);
		expect(systems[4].measures[0].events.map((note) => note.fret)).toEqual([10, 12, 12, 14]);
		expect(systems[4].measures[1].events.map((note) => note.fret)).toEqual([12, 3]);
		expect(systems[4].measures[2].events.map((note) => note.fret)).toEqual([1, 2, 3]);
		const articulations = systems[5].measures;
		expect(articulations.map((measure) => measure.width)).toEqual([7, 7, 5, 5]);
		expect(articulations[0].events.map((event) => event.kind)).toEqual([
			'note',
			'technique',
			'note',
			'note',
			'technique',
			'note'
		]);
		expect(systems[6].measures.map((measure) => measure.width)).toEqual([2, 7, 9, 8]);
		const rhythm = systems[8].measures;
		expect(rhythm.every((measure) => measure.timed)).toBe(true);
		expect(rhythm.map((measure) => measure.events.map((event) => event.kind))).toEqual([
			['note', 'note', 'note', 'note', 'rest', 'note'],
			['note', 'note', 'note', 'note', 'note', 'rest']
		]);
		const { layout } = renderTab(EXAMPLE_SOURCE, tuning);
		const silentBar = layout.measures.find((measure) => measure.notes.length === 0);
		expect(silentBar?.width).toBe(4);
		const schedule = buildSchedule(layout.measures, tuning);
		expect(schedule.notes.some((note) => note.measureId === silentBar?.id)).toBe(false);
		expect(schedule.length).toBe(layout.measures.length);
	});

	it('places the newline comment above the next row and preserves the previous string', () => {
		const tuning = getTuning('standard-4');
		const { systems } = parse(EXAMPLE_SOURCE, tuning);
		expect(systems[7].measures[0].events.map((note) => [note.string, note.fret])).toEqual([
			[0, 3],
			[0, 2],
			[0, 0]
		]);
		expect(renderTab(EXAMPLE_SOURCE, tuning).text).toContain(
			'\n\n# Newlines start a new row of tab.\n' +
				'# Bare frets still use the previous string (E here). A final | is optional.\n' +
				'G|-----|\nD|-----|\nA|-----|\nE|3-2-0|'
		);
	});
});

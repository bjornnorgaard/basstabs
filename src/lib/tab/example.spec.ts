import { describe, expect, it } from 'vitest';
import { EXAMPLE_SOURCE } from './example';
import { parse } from './parser';
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

	it('demonstrates every syntax feature in six lines', () => {
		const tuning = getTuning('standard-4');
		const { blocks, systems, tokens } = parse(EXAMPLE_SOURCE, tuning);
		expect(EXAMPLE_SOURCE.split('\n')).toHaveLength(6);
		expect(EXAMPLE_SOURCE).toContain('\n\n# Newlines start a new row of tab.');
		expect(blocks.map((block) => block.kind)).toEqual([
			'section',
			'annotation',
			'system',
			'annotation',
			'system'
		]);
		expect(blocks[3]).toEqual({
			kind: 'annotation',
			text: 'Newlines start a new row of tab.'
		});
		expect(new Set(tokens.map((token) => token.kind))).toEqual(
			new Set(['section', 'comment', 'bar', 'string', 'fret'])
		);
		for (const token of tokens.filter((token) => token.kind === 'string')) {
			const name = EXAMPLE_SOURCE.slice(token.start, token.end);
			expect(name).toBe(name.toUpperCase());
		}
		expect(systems[0].measures.map((measure) => measure.width)).toEqual([11, 7, 4]);
		expect(systems[0].measures[2].events).toEqual([]);
		expect(systems[0].measures[0].events.map((note) => note.fret)).toEqual([0, 2, 2, 3, 2, 0]);
		expect(systems[0].measures[0].events.map((note) => note.joinedToPrevious)).toEqual([
			false,
			false,
			false,
			true,
			true,
			true
		]);
		expect(systems[1].measures[0].events.map((note) => [note.string, note.fret])).toEqual([
			[3, 5],
			[3, 7]
		]);
		expect(renderTab(EXAMPLE_SOURCE, tuning).text).toBe(
			'[Example]\n# String names ignore case. Spaces leave gaps; A2E320 joins notes; D10 is fret 10.\n' +
				'G|-----------|----12-|----|\n' +
				'D|-----------|-10----|----|\n' +
				'A|-----2-----|-------|----|\n' +
				'E|-0-2--320--|-------|----|\n\n' +
				'# Newlines start a new row of tab.\nG|5-7|\nD|---|\nA|---|\nE|---|'
		);
	});
});

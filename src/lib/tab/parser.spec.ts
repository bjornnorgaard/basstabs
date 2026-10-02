import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { buildSchedule } from './playback';
import { renderTab } from './render';
import { TUNINGS, getTuning } from './tuning';

const tuning = getTuning('standard-4');

describe('explicit multi-digit frets', () => {
	it.each([
		['E12', [1, 2]],
		['E123', [1, 2, 3]],
		['E[12]', [12]],
		['E[12]3', [12, 3]],
		['E1[23]', [1, 23]],
		['E[12][13]', [12, 13]],
		['E0 12 [12]', [0, 1, 2, 12]],
		['E0\n[12] [14]', [0, 12, 14]]
	])('parses %s without ambiguity', (source, frets) => {
		const result = parse(source, tuning);
		expect(result.errors).toEqual([]);
		expect(
			result.systems.flatMap((row) => row.measures.flatMap((m) => m.events.map((n) => n.fret)))
		).toEqual(frets);
	});

	it.each(TUNINGS)('supports brackets and case-insensitive prefixes for $label', (tuning) => {
		const source = tuning.strings.map((name) => `${name.toLowerCase()}[12]3`).join(' | ');
		const { systems, errors } = parse(source, tuning);
		expect(errors).toEqual([]);
		expect(systems[0].measures.map((m) => m.events.map((n) => [n.string, n.fret]))).toEqual(
			tuning.strings.map((_, i) => [
				[i, 12],
				[i, 3]
			])
		);
	});

	it('excludes brackets from tab columns but includes them in highlighted fret spans', () => {
		const source = '|E[12]3 [14]|';
		const { text, layout, tokens, errors } = renderTab(source, tuning);
		expect(errors).toEqual([]);
		expect(text).toBe('G|------|\nD|------|\nA|------|\nE|123-14|');
		expect(
			tokens.filter((t) => t.kind === 'fret').map((t) => source.slice(t.start, t.end))
		).toEqual(['[12]', '3', '[14]']);
		expect(layout.measures[0].notes.map((n) => [n.width, n.joinedToPrevious])).toEqual([
			[2, false],
			[1, true],
			[2, false]
		]);
		expect(
			buildSchedule(layout.measures, tuning).notes.map((n) => [n.midi, n.start, n.length])
		).toEqual([
			[40, 0, 0.25],
			[31, 0.25, 0.25],
			[42, 0.5, 0.5]
		]);
	});

	it('keeps whole-line headings distinct from bare bracketed frets inside bars', () => {
		const result = parse('[Verse]\nE0\n[12]\n|[12]|', tuning);
		expect(result.errors).toEqual([]);
		expect(result.blocks.map((b) => b.kind)).toEqual(['section', 'system', 'section', 'system']);
		expect(result.systems[1].measures[0].events[0].fret).toBe(12);
	});

	it.each(['E[]', 'E[12', 'E[abc]', 'E[-1]', 'E[1.2]', 'E0 [12', 'E0 [abc]'])(
		'reports malformed fret %s',
		(source) => {
			expect(parse(source, tuning).errors.length).toBeGreaterThan(0);
		}
	);
});

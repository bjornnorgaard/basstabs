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

	describe('articulation notation', () => {
		it('parses all supported articulations with exact columns', () => {
			const source = String.raw`E5h7 E7p5 E3/5 E5\3 E5b E5~ Ex E(5)|`;
			const result = parse(source, tuning);
			expect(result.errors).toEqual([]);
			expect(result.features.articulations).toBe(true);
			expect(result.systems[0].measures[0].events).toEqual([
				{ kind: 'note', string: 0, fret: 5, digits: '5', column: 0, joinedToPrevious: false },
				{ kind: 'technique', technique: 'hammer-on', string: 0, symbol: 'h', column: 1 },
				{ kind: 'note', string: 0, fret: 7, digits: '7', column: 2, joinedToPrevious: true },
				{ kind: 'note', string: 0, fret: 7, digits: '7', column: 4, joinedToPrevious: false },
				{ kind: 'technique', technique: 'pull-off', string: 0, symbol: 'p', column: 5 },
				{ kind: 'note', string: 0, fret: 5, digits: '5', column: 6, joinedToPrevious: true },
				{ kind: 'note', string: 0, fret: 3, digits: '3', column: 8, joinedToPrevious: false },
				{ kind: 'technique', technique: 'slide-up', string: 0, symbol: '/', column: 9 },
				{ kind: 'note', string: 0, fret: 5, digits: '5', column: 10, joinedToPrevious: true },
				{ kind: 'note', string: 0, fret: 5, digits: '5', column: 12, joinedToPrevious: false },
				{ kind: 'technique', technique: 'slide-down', string: 0, symbol: '\\', column: 13 },
				{ kind: 'note', string: 0, fret: 3, digits: '3', column: 14, joinedToPrevious: true },
				{ kind: 'note', string: 0, fret: 5, digits: '5', column: 16, joinedToPrevious: false },
				{ kind: 'technique', technique: 'bend', string: 0, symbol: 'b', column: 17 },
				{ kind: 'note', string: 0, fret: 5, digits: '5', column: 19, joinedToPrevious: false },
				{ kind: 'technique', technique: 'vibrato', string: 0, symbol: '~', column: 20 },
				{ kind: 'dead-note', string: 0, digits: 'x', column: 22, joinedToPrevious: false },
				{
					kind: 'note',
					string: 0,
					fret: 5,
					digits: '5',
					display: '(5)',
					ghost: true,
					column: 24,
					joinedToPrevious: false
				}
			]);
			expect(result.systems[0].measures[0].width).toBe(27);
		});

		it('keeps adjacent B-string notes valid instead of reading them as bends', () => {
			const result = parse('A2B0', getTuning('standard-5'));
			expect(result.errors).toEqual([]);
			expect(result.systems[0].measures[0].events).toEqual([
				{ kind: 'note', string: 2, fret: 2, digits: '2', column: 0, joinedToPrevious: false },
				{ kind: 'note', string: 0, fret: 0, digits: '0', column: 1, joinedToPrevious: true }
			]);
		});

		it('reports connectors without an adjacent source note or target at the articulation column', () => {
			expect(
				parse('h5 E5 h7 E5h', tuning).errors.map((error) => [error.column, error.message])
			).toEqual([
				[1, 'Articulation "h" needs a preceding note'],
				[7, 'Articulation "h" needs a preceding note'],
				[12, 'Articulation "h" needs a target fret']
			]);
		});

		it('does not reinterpret articulation characters from previously valid syntax', () => {
			// `B` is the only suggested articulation character that can also be a valid string prefix.
			// Adjacent B-string notes keep their old meaning; bend is only `b` without a following fret.
			expect(parse('A2B0', getTuning('standard-5')).errors).toEqual([]);
			for (const source of ['E5h7', 'E7p5', 'E3/5', String.raw`E5\3`, 'E5~', 'E5b', 'Ex', 'E(5)']) {
				expect(parse(source, tuning).features.articulations).toBe(true);
			}
		});
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

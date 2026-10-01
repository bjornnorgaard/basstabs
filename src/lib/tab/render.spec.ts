import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { renderTab } from './render';
import { getTuning } from './tuning';

const bass4 = getTuning('standard-4');
const bass5 = getTuning('standard-5');

describe('renderTab', () => {
	it('renders the README example', () => {
		const { text, errors } = renderTab('E0 0 A2 2 |E0 0 3 A2 |', bass4);
		expect(errors).toEqual([]);
		expect(text.split('\n')).toEqual([
			'G|--------|--------|',
			'D|--------|--------|',
			'A|----2-2-|------2-|',
			'E|0-0-----|0-0-3---|'
		]);
	});

	it('closes a trailing measure without a final bar line and ignores a leading one', () => {
		expect(renderTab('|E0 0 A2 2', bass4).text).toBe(renderTab('E0 0 A2 2 |', bass4).text);
	});

	it('handles attached bar lines and lowercase string names', () => {
		expect(renderTab('e0 0 a2 2|e0 0 3 a2|', bass4).text).toBe(
			renderTab('E0 0 A2 2 |E0 0 3 A2 |', bass4).text
		);
	});

	it('widens columns for two-digit frets', () => {
		expect(renderTab('G12 D10 9 |', bass4).text.split('\n')).toEqual([
			'G|12------|',
			'D|---10-9-|',
			'A|--------|',
			'E|--------|'
		]);
	});

	it('renders adjacent string-prefixed notes as single-fret columns', () => {
		const source =
			'E0 0 A2 2 |E0 0 3 A2|E0 0 A2 2 |E0 0 3 A2|E0 0 A2 2 |E0 0 3 A2|E3 3 3 3 |A2E320    |';
		const { text, errors } = renderTab(source, bass4);
		expect(errors).toEqual([]);
		expect(text.split('\n').map((row) => row.slice(-10))).toEqual([
			'|--------|',
			'|--------|',
			'|2-------|',
			'|-320----|'
		]);
		expect(
			parse('A2E320 |', bass4).systems[0].measures[0].events.map(({ string, fret }) => ({
				string,
				fret
			}))
		).toEqual(
			parse('A2 E3 2 0 |', bass4).systems[0].measures[0].events.map(({ string, fret }) => ({
				string,
				fret
			}))
		);
	});

	it('renders each input line as a separate system and carries the string across lines', () => {
		const systems = renderTab('E3 |\n\n5 |', bass4).text.split('\n\n');
		expect(systems).toHaveLength(2);
		expect(systems[1]).toContain('E|5-|');
	});

	it('supports 5-string tunings', () => {
		expect(renderTab('B0 E0 |', bass5).text.split('\n')).toEqual([
			'G|----|',
			'D|----|',
			'A|----|',
			'E|--0-|',
			'B|0---|'
		]);
	});

	it('returns an empty string for empty input', () => {
		expect(renderTab('  \n\n', bass4).text).toBe('');
	});
});

describe('parse errors', () => {
	it('reports a fret with no preceding string', () => {
		const { errors } = parse('3 E0', bass4);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({ line: 1, column: 1 });
	});

	it('reports unknown strings and tokens with positions', () => {
		const { errors } = parse('E0 B2\nx?', bass4);
		expect(errors.map((e) => [e.line, e.column])).toEqual([
			[1, 4],
			[2, 1]
		]);
	});

	it('reports an unknown string within a compact group at its actual position', () => {
		const { systems, errors } = parse('A2Z3E0 |', bass4);
		expect(errors).toMatchObject([{ line: 1, column: 3, length: 2 }]);
		expect(systems[0].measures[0].events).toHaveLength(2);
	});

	it('does not accept punctuation in a compact group', () => {
		expect(parse('A2E3?', bass4).errors).toMatchObject([
			{ line: 1, column: 1, length: 5, message: 'Unrecognised token "A2E3?"' }
		]);
	});
});

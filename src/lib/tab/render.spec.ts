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

	it('parses adjacent notes without requiring spaces between columns', () => {
		const { systems, errors } = parse('A2E320', bass4);

		expect(errors).toEqual([]);
		expect(systems[0].measures[0].events).toEqual([
			{ kind: 'note', string: 1, fret: 2 },
			{ kind: 'note', string: 0, fret: 3 },
			{ kind: 'note', string: 0, fret: 2 },
			{ kind: 'note', string: 0, fret: 0 }
		]);
	});

	it('accepts the complete shorthand reported by the user', () => {
		const source = `|E0 0 A2 2 |E0 0 3 A2|E0 0 A2 2 |E0 0 3 A2|E0 0 A2 2 |E0 0 3 A2|E3 3 3 3 |A2E320    |

|E0 0 0 0 |A3 3 2 2 |E0 0 0 0 |A3 3 2 2 |

|E0 0 3 A2|E0 0 3 A2|A3 3 3 3 |A2E320    |

|E0 0 3 A2|E0 0 3 A2|A3 3 3 3 |A2E320    |

|E0 0 3 A2|E0 0 3 A2|E0 0 3 A2|E0 0 3 A2|E0 0 3 A2|E0 0 3 A2|E0 0 3 A2|E0 0 3 A2|`;

		expect(parse(source, bass4).errors).toEqual([]);
	});

	it('widens columns for two-digit frets', () => {
		expect(renderTab('G12 D10 9 |', bass4).text.split('\n')).toEqual([
			'G|12------|',
			'D|---10-9-|',
			'A|--------|',
			'E|--------|'
		]);
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
});

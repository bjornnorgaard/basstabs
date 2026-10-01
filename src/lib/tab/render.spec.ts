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
			{ kind: 'note', string: 1, fret: 2, joinedToPrevious: false },
			{ kind: 'note', string: 0, fret: 3, joinedToPrevious: true },
			{ kind: 'note', string: 0, fret: 2, joinedToPrevious: true },
			{ kind: 'note', string: 0, fret: 0, joinedToPrevious: true }
		]);
	});

	it('renders notes with no whitespace between them packed tightly, as a quick succession', () => {
		const { text, errors } = renderTab('A2E320    |', bass4);
		expect(errors).toEqual([]);
		expect(text.split('\n')).toEqual(['G|--------|', 'D|--------|', 'A|2-------|', 'E|-320----|']);
	});

	it('preserves arbitrary trailing spaces in each bar and an unterminated final bar', () => {
		expect(renderTab('|E1       |', bass4).text).toBe(
			'G|--------|\nD|--------|\nA|--------|\nE|1-------|'
		);

		const source = '|E1       |A2                    |E3   ';
		const { text, layout, errors } = renderTab(source, bass4);
		expect(errors).toEqual([]);
		expect(text.split('\n')).toEqual([
			`G|--------|${'-'.repeat(21)}|----|`,
			`D|--------|${'-'.repeat(21)}|----|`,
			`A|--------|2${'-'.repeat(20)}|----|`,
			`E|1-------|${'-'.repeat(21)}|3---|`
		]);
		expect(layout.measures.map(({ width }) => width)).toEqual([8, 21, 4]);
		expect(parse(source, bass4).systems[0].measures.map((m) => m.trailingSpaces)).toEqual([
			7, 20, 3
		]);
	});

	it('does not double-count trailing spaces already covered by joined notes filler', () => {
		const { text, layout } = renderTab('A2E320    |E1       |', bass4);
		expect(text.split('\n')).toEqual([
			'G|--------|--------|',
			'D|--------|--------|',
			'A|2-------|--------|',
			'E|-320----|1-------|'
		]);
		expect(layout.measures.map(({ width }) => width)).toEqual([8, 8]);
	});

	it('keeps notes separated by whitespace in their own columns even when otherwise adjacent', () => {
		// "E0 0" has spaces between every token, so each note keeps its own trailing filler,
		// unlike the back-to-back "320" shorthand above.
		const { text } = renderTab('E0 0 0 |', bass4);
		expect(text.split('\n')).toEqual(['G|------|', 'D|------|', 'A|------|', 'E|0-0-0-|']);
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

	it('renders section names and comments above rows without altering notes or string continuity', () => {
		const source =
			'[Intro]\n# Play softly\nE3 |\n# First lyric line: ...\n5 |\n\n[Chorus]\n# Louder\nA2 |';
		const { blocks, systems, errors } = parse(source, bass4);
		expect(errors).toEqual([]);
		expect(blocks.map((block) => block.kind)).toEqual([
			'section',
			'annotation',
			'system',
			'annotation',
			'system',
			'section',
			'annotation',
			'system'
		]);
		expect(blocks[0]).toEqual({ kind: 'section', title: 'Intro' });
		expect(blocks[1]).toEqual({ kind: 'annotation', text: 'Play softly' });
		expect(systems).toHaveLength(3);
		expect(renderTab(source, bass4).text).toBe(
			'[Intro]\n# Play softly\nG|--|\nD|--|\nA|--|\nE|3-|' +
				'\n\n# First lyric line: ...\nG|--|\nD|--|\nA|--|\nE|5-|' +
				'\n\n[Chorus]\n# Louder\nG|--|\nD|--|\nA|2-|\nE|--|'
		);
	});

	it('preserves standalone headings and annotations, including indented lines and CRLF', () => {
		const { text, errors } = renderTab('  [Verse 1]  \r\n  # words [here] | @repeat  \r\n', bass4);
		expect(errors).toEqual([]);
		expect(text).toBe('[Verse 1]\n# words [here] | @repeat');
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

	it('reports an empty section name instead of silently discarding it', () => {
		expect(parse('  [  ]\nE0 |', bass4).errors).toEqual([
			{ line: 1, column: 3, length: 4, message: 'Section name cannot be empty' }
		]);
	});

	it('does not treat inline markers as whole-line comments or headings', () => {
		const { blocks, errors } = parse('E0 # note\nE0 [Verse]', bass4);
		expect(blocks.map((block) => block.kind)).toEqual(['system', 'system']);
		expect(errors.map(({ line, column }) => [line, column])).toEqual([
			[1, 4],
			[1, 6],
			[2, 4]
		]);
	});
});

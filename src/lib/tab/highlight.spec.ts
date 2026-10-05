import { describe, expect, it } from 'vitest';
import { highlightSegments, noteAtCaret, stringHue } from './highlight';
import { parse } from './parser';
import { renderTab } from './render';
import { getTuning } from './tuning';

const bass4 = getTuning('standard-4');

function describeTokens(source: string) {
	return parse(source, bass4).tokens.map(
		(t) => `${t.kind}:${source.slice(t.start, t.end)}${t.note !== undefined ? `#${t.note}` : ''}`
	);
}

describe('source tokens', () => {
	it('tags strings, frets and bars with their note index', () => {
		expect(describeTokens('E0 0 A2|')).toEqual([
			'string:E#0',
			'fret:0#0',
			'fret:0#1',
			'string:A#2',
			'fret:2#2',
			'bar:|'
		]);
	});

	it('splits joined notes into separate tokens', () => {
		expect(describeTokens('E320')).toEqual(['string:E#0', 'fret:3#0', 'fret:2#1', 'fret:0#2']);
	});

	it('marks sections, comments and invalid tokens with offsets across lines', () => {
		const source = '[Verse]\r\n  # soft\n[ ]\nX1 E0 ?';
		expect(describeTokens(source)).toEqual([
			'section:[Verse]',
			'comment:# soft',
			'invalid:[ ]',
			'invalid:X1',
			'string:E#0',
			'fret:0#0',
			'invalid:?'
		]);
	});

	it('flags frets that have no string yet', () => {
		expect(describeTokens('3 E1')).toEqual(['invalid:3', 'string:E#0', 'fret:1#0']);
	});

	it('numbers notes like the rendered layout does', () => {
		const source = 'E0 1 |\n# x\n[A]\nA2E3 |';
		const { layout, tokens } = renderTab(source, bass4);
		const layoutNotes = layout.measures.flatMap((m) => m.notes);
		for (const token of tokens.filter((t) => t.kind === 'fret')) {
			const note = layoutNotes.find((n) => n.id === token.note);
			expect(note?.fret).toBe(Number(source.slice(token.start, token.end)));
			expect(note?.string).toBe(token.string);
		}
	});

	it('tags articulation glyphs as technique tokens', () => {
		const source = String.raw`E5h7 E5b Ex E(5)|`;
		expect(describeTokens(source)).toEqual([
			'string:E#0',
			'fret:5#0',
			'technique:h#0',
			'fret:7#1',
			'string:E#2',
			'fret:5#2',
			'technique:b#2',
			'string:E#3',
			'technique:x#3',
			'string:E#4',
			'technique:(#4',
			'fret:5#4',
			'technique:)#4',
			'bar:|'
		]);
	});

	it('tags rhythm duration and rest markers separately from frets', () => {
		const source = ':q. E0 :r :re|';
		expect(describeTokens(source)).toEqual([
			'duration::q.',
			'string:E#0',
			'fret:0#0',
			'rest::r',
			'rest::re',
			'bar:|'
		]);
	});
});

describe('highlightSegments', () => {
	it('rebuilds the source', () => {
		const source = '[Intro]\nE0 0 A2 |  ?\n# end\n';
		const segments = highlightSegments(source, parse(source, bass4).tokens);
		expect(segments.map((s) => s.text).join('')).toBe(source);
	});
});

describe('noteAtCaret', () => {
	const { tokens } = parse('E0 [12] A3', bass4);

	it('prefers the note just before the caret', () => {
		expect(noteAtCaret(tokens, 2)).toBe(0);
		expect(noteAtCaret(tokens, 7)).toBe(1);
		expect(noteAtCaret(tokens, 4)).toBe(1);
		expect(noteAtCaret(tokens, 6)).toBe(1);
	});

	it('falls back to the note starting at the caret', () => {
		expect(noteAtCaret(tokens, 0)).toBe(0);
		expect(noteAtCaret(tokens, 8)).toBe(2);
	});

	it('returns nothing between notes', () => {
		expect(noteAtCaret(parse('E0  1', bass4).tokens, 3)).toBeUndefined();
	});
});

describe('stringHue', () => {
	it('keeps a string colour stable across tunings', () => {
		expect(stringHue('e', 1)).toBe(stringHue('E', 0));
	});
});

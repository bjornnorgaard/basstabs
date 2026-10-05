/**
 * Quick-insert snippets for the shorthand editor toolbar. Placement rules differ by
 * notation kind: connectors attach to the preceding fret, markers are separate words,
 * and headings, comments and tempo markers need a line of their own.
 */
export type InsertKind = 'word' | 'attach' | 'wrap' | 'line';

export type Snippet = {
	text: string;
	kind: InsertKind;
	/** Range within `text` to select after inserting, e.g. a placeholder number. */
	select?: [number, number];
};

export type NotationItem = {
	label: string;
	/** Glyph shown on the menu item. */
	glyph: string;
	/** Short shorthand example of the notation in context. */
	example: string;
	snippet: Snippet;
	/** Overrides the group's highlight class for this glyph. */
	glyphClass?: string;
};

export type NotationGroup = {
	id: 'technique' | 'rhythm' | 'structure';
	label: string;
	/** Highlight class used for the glyphs, matching the editor colours. */
	glyphClass: string;
	items: NotationItem[];
};

export const NOTATION_GROUPS: NotationGroup[] = [
	{
		id: 'technique',
		label: 'Technique',
		glyphClass: 'hl-technique',
		items: [
			{ label: 'Hammer-on', glyph: 'h', example: '5h7', snippet: { text: 'h', kind: 'attach' } },
			{ label: 'Pull-off', glyph: 'p', example: '7p5', snippet: { text: 'p', kind: 'attach' } },
			{ label: 'Slide up', glyph: '/', example: '3/5', snippet: { text: '/', kind: 'attach' } },
			{
				label: 'Slide down',
				glyph: '\\',
				example: '5\\3',
				snippet: { text: '\\', kind: 'attach' }
			},
			{ label: 'Bend', glyph: 'b', example: '5b', snippet: { text: 'b', kind: 'attach' } },
			{ label: 'Vibrato', glyph: '~', example: '5~', snippet: { text: '~', kind: 'attach' } },
			{ label: 'Dead note', glyph: 'x', example: 'E x', snippet: { text: 'x', kind: 'word' } },
			{ label: 'Ghost note', glyph: '( )', example: '(5)', snippet: { text: '()', kind: 'wrap' } }
		]
	},
	{
		id: 'rhythm',
		label: 'Rhythm',
		glyphClass: 'hl-duration',
		items: [
			{ label: 'Whole', glyph: ':w', example: ':w E0', snippet: { text: ':w', kind: 'word' } },
			{ label: 'Half', glyph: ':h', example: ':h E0', snippet: { text: ':h', kind: 'word' } },
			{ label: 'Quarter', glyph: ':q', example: ':q E0', snippet: { text: ':q', kind: 'word' } },
			{ label: 'Eighth', glyph: ':e', example: ':e E0 0', snippet: { text: ':e', kind: 'word' } },
			{
				label: 'Sixteenth',
				glyph: ':s',
				example: ':s E0 0',
				snippet: { text: ':s', kind: 'word' }
			},
			{
				label: 'Dotted (after a duration)',
				glyph: '.',
				example: ':q.',
				snippet: { text: '.', kind: 'attach' }
			},
			{
				label: 'Rest',
				glyph: ':r',
				example: ':q E0 :r',
				snippet: { text: ':r', kind: 'word' },
				glyphClass: 'hl-rest'
			}
		]
	},
	{
		id: 'structure',
		label: 'Structure',
		glyphClass: 'hl-repeat',
		items: [
			{
				label: 'Repeat start',
				glyph: '|:',
				example: '|: E0 0',
				snippet: { text: '|:', kind: 'word' }
			},
			{
				label: 'Repeat end',
				glyph: ':|',
				example: 'E0 0 :|',
				snippet: { text: ':|', kind: 'word' }
			},
			{
				label: 'Repeat end × count',
				glyph: ':|x3',
				example: ':|x3',
				snippet: { text: ':|x3', kind: 'word', select: [3, 4] }
			},
			{
				label: 'Tempo change',
				glyph: '@120',
				example: '@120',
				snippet: { text: '@120', kind: 'line', select: [1, 4] },
				glyphClass: 'hl-tempo'
			},
			{
				label: 'Section heading',
				glyph: '[ ]',
				example: '[Verse]',
				snippet: { text: '[Section]', kind: 'line', select: [1, 8] },
				glyphClass: 'hl-section'
			},
			{
				label: 'Comment or lyrics',
				glyph: '#',
				example: '# play softly',
				snippet: { text: '# ', kind: 'line' },
				glyphClass: 'hl-comment'
			}
		]
	}
];

export type InsertResult = {
	from: number;
	to: number;
	insert: string;
	selection: { anchor: number; head: number };
};

/** Computes the edit for inserting `snippet` over the selection `from`–`to` of `doc`. */
export function planInsert(doc: string, from: number, to: number, snippet: Snippet): InsertResult {
	const before = doc.slice(0, from);
	const selected = doc.slice(from, to);
	let prefix = '';
	let suffix = '';
	let body = snippet.text;
	let caret = snippet.text.length;

	switch (snippet.kind) {
		case 'attach':
			break;
		case 'word':
			if (before.length > 0 && !/\s$/.test(before)) prefix = ' ';
			break;
		case 'wrap':
			body = `(${selected})`;
			caret = selected ? body.length : 1;
			break;
		case 'line': {
			const lineStart = before.lastIndexOf('\n') + 1;
			const lineEndIndex = doc.indexOf('\n', to);
			const lineEnd = lineEndIndex === -1 ? doc.length : lineEndIndex;
			if (doc.slice(lineStart, from).trim()) {
				prefix = '\n';
				while (from > lineStart && /[ \t]/.test(doc[from - 1])) from--;
			}
			if (doc.slice(to, lineEnd).trim()) {
				suffix = '\n';
				while (to < lineEnd && /[ \t]/.test(doc[to])) to++;
			}
			break;
		}
	}

	const insert = `${prefix}${body}${suffix}`;
	const start = from + prefix.length;
	const selection = snippet.select
		? { anchor: start + snippet.select[0], head: start + snippet.select[1] }
		: { anchor: start + caret, head: start + caret };
	return { from, to, insert, selection };
}

import { describe, expect, it } from 'vitest';
import { NOTATION_GROUPS, planInsert, type Snippet } from './insert';
import { renderTab } from './render';
import { getTuning } from './tuning';

const bass4 = getTuning('bass4');

function apply(doc: string, from: number, to: number, snippet: Snippet) {
	const edit = planInsert(doc, from, to, snippet);
	const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
	return {
		doc: next,
		selected: next.slice(edit.selection.anchor, edit.selection.head),
		caret: edit.selection.head
	};
}

function snippet(label: string): Snippet {
	for (const group of NOTATION_GROUPS) {
		const item = group.items.find((candidate) => candidate.label === label);
		if (item) return item.snippet;
	}
	throw new Error(`No snippet ${label}`);
}

describe('planInsert', () => {
	it('attaches connectors directly after the fret and leaves the caret for the target', () => {
		const result = apply('E5', 2, 2, snippet('Hammer-on'));
		expect(result.doc).toBe('E5h');
		expect(result.caret).toBe(3);
		expect(renderTab(`${result.doc}7 |`, bass4).errors).toEqual([]);
	});

	it('attaches the dotted modifier to a duration marker', () => {
		const result = apply('E0 :q', 5, 5, snippet('Dotted (after a duration)'));
		expect(result.doc).toBe('E0 :q.');
	});

	it('separates word markers with a space like string names', () => {
		expect(apply('E0', 2, 2, snippet('Eighth')).doc).toBe('E0 :e');
		expect(apply('E0 ', 3, 3, snippet('Eighth')).doc).toBe('E0 :e');
		expect(apply('', 0, 0, snippet('Repeat start')).doc).toBe('|:');
	});

	it('wraps a selected fret as a ghost note, or places the caret inside empty brackets', () => {
		expect(apply('E5', 1, 2, snippet('Ghost note'))).toMatchObject({ doc: 'E(5)', caret: 4 });
		expect(apply('E', 1, 1, snippet('Ghost note'))).toMatchObject({ doc: 'E()', caret: 2 });
	});

	it('selects the repeat count so it can be typed over', () => {
		const result = apply('|: E0 0', 7, 7, snippet('Repeat end × count'));
		expect(result.doc).toBe('|: E0 0 :|x3');
		expect(result.selected).toBe('3');
		expect(renderTab(result.doc, bass4).errors).toEqual([]);
	});

	it('puts line-level notation on its own line and selects the placeholder', () => {
		const tempo = apply('E0 0 | A2 |', 4, 4, snippet('Tempo change'));
		expect(tempo.doc).toBe('E0 0\n@120\n| A2 |');
		expect(tempo.selected).toBe('120');

		const heading = apply('', 0, 0, snippet('Section heading'));
		expect(heading.doc).toBe('[Section]');
		expect(heading.selected).toBe('Section');

		const comment = apply('E0 |\n', 5, 5, snippet('Comment or lyrics'));
		expect(comment).toMatchObject({ doc: 'E0 |\n# ', caret: 7 });
	});

	it('produces valid shorthand for every menu item in a typical context', () => {
		const contexts: Record<string, [string, string]> = {
			'Hammer-on': ['E5', '7 |'],
			'Pull-off': ['E7', '5 |'],
			'Slide up': ['E3', '5 |'],
			'Slide down': ['E5', '3 |'],
			Bend: ['E5', ' |'],
			Vibrato: ['E5', ' |'],
			'Dead note': ['E0', ' |'],
			'Ghost note': ['E', ' |'],
			Whole: ['', ' E0 |'],
			Half: ['', ' E0 |'],
			Quarter: ['', ' E0 |'],
			Eighth: ['', ' E0 0 |'],
			Sixteenth: ['', ' E0 0 |'],
			'Dotted (after a duration)': [':q', ' E0 |'],
			Rest: [':q E0', ' |'],
			'Repeat start': ['', ' E0 0 :|'],
			'Repeat end': ['|: E0 0', ''],
			'Repeat end × count': ['|: E0 0', ''],
			'Tempo change': ['', '\nE0 |'],
			'Section heading': ['', '\nE0 |'],
			'Comment or lyrics': ['', '\nE0 |']
		};
		for (const group of NOTATION_GROUPS) {
			for (const item of group.items) {
				const context = contexts[item.label];
				expect(context, item.label).toBeDefined();
				const [before, after] = context;
				let { doc } = apply(before, before.length, before.length, item.snippet);
				if (item.label === 'Ghost note') doc = doc.replace('()', '(5)');
				if (item.label === 'Comment or lyrics') doc += 'note';
				expect(renderTab(doc + after, bass4).errors, `${item.label}: ${doc + after}`).toEqual([]);
			}
		}
	});
});

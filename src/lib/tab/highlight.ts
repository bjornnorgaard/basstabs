import type { SourceToken } from './parser';

export interface HighlightSegment {
	text: string;
	token?: SourceToken;
}

/** Splits the source into plain and token segments that together rebuild the source. */
export function highlightSegments(source: string, tokens: SourceToken[]): HighlightSegment[] {
	const segments: HighlightSegment[] = [];
	let cursor = 0;
	for (const token of tokens) {
		if (token.start < cursor) continue;
		if (token.start > cursor) segments.push({ text: source.slice(cursor, token.start) });
		segments.push({ text: source.slice(token.start, token.end), token });
		cursor = token.end;
	}
	if (cursor < source.length) segments.push({ text: source.slice(cursor) });
	return segments;
}

/**
 * Finds the note the caret is on. The note just before the caret wins, so the note you've just
 * typed stays selected; otherwise the note starting at the caret is used.
 */
export function noteAtCaret(tokens: SourceToken[], caret: number): number | undefined {
	const notes = tokens.filter((t) => t.note !== undefined);
	return (
		notes.find((t) => t.start < caret && caret <= t.end)?.note ??
		notes.find((t) => t.start === caret)?.note
	);
}

const STRING_HUES: Record<string, number> = { B: 95, E: 45, A: 145, D: 250, G: 320, C: 195 };

/** A stable OKLCH hue per string name, so a string keeps its colour across tunings. */
export function stringHue(name: string, index = 0): number {
	return STRING_HUES[name.toUpperCase()] ?? (index * 67) % 360;
}

/** CSS class for a token (see the `.hl-*` rules in layout.css). */
export function tokenClass(token: SourceToken): string {
	if (token.kind === 'string') return 'hl-string-name';
	if (token.kind === 'fret') return 'hl-string';
	if (token.kind === 'technique') return 'hl-technique';
	return `hl-${token.kind}`;
}

/** Splits the filler between rendered notes into the string label, dashes and bar lines for styling. */
export function fillerParts(text: string): { text: string; class: string }[] {
	return [...text.matchAll(/-+|\|+|\s+|[^-|\s]+/g)].map(([part]) => ({
		text: part,
		class:
			part[0] === '-'
				? 'hl-fill'
				: part[0] === '|'
					? 'hl-bar'
					: /\S/.test(part)
						? 'hl-string-name'
						: ''
	}));
}

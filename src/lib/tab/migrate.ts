import { parse } from './parser';
import type { Tuning } from './tuning';

/** Preserve legacy pitches, columns, and grouping by bracketing multi-digit frets. */
export function migrateLegacySource(source: string, tuning: Tuning): string {
	const tokens = parse(source, tuning, 1).tokens.filter(
		(token) => token.kind === 'fret' && token.end - token.start > 1
	);
	let migrated = source;
	for (const token of tokens.reverse()) {
		migrated =
			migrated.slice(0, token.start) +
			`[${migrated.slice(token.start, token.end)}]` +
			migrated.slice(token.end);
	}
	// A lone bracketed fret would otherwise be read as a whole-line section heading.
	const originalLines = source.split('\n');
	return migrated
		.split('\n')
		.map((line, i) => {
			if (!/^\s*\[\d+\]\s*$/.test(line) || line === originalLines[i]) return line;
			const ending = line.endsWith('\r') ? '\r' : '';
			return `|${line.replace(/\r$/, '')}|${ending}`;
		})
		.join('\n');
}

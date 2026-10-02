import { describe, expect, it } from 'vitest';
import { migrateLegacySource } from './migrate';
import { parse } from './parser';
import { TUNINGS } from './tuning';

describe('legacy source migration', () => {
	it.each(TUNINGS)('preserves legacy music and layout for $label', (tuning) => {
		const source = '[Intro]\r\n# E12 remains text\r\nE12 10 E320 A35|  |G01|\n12\n[12]\n 14 \nA2E3';
		const migrated = migrateLegacySource(source, tuning);
		expect(migrated).toBe(
			'[Intro]\r\n# E12 remains text\r\nE[12] [10] E320 A[35]|  |G[01]|\n|[12]|\n[12]\n| [14] |\nA2E3'
		);
		const legacy = parse(source, tuning, 1);
		const current = parse(migrated, tuning);
		expect(current.errors).toEqual([]);
		expect(current.blocks).toEqual(legacy.blocks);
	});

	it('leaves legacy single-digit runs, comments, and headings unchanged', () => {
		const source = '[123]\n# G12\n|E4320|A2E320|E3 5|';
		expect(migrateLegacySource(source, TUNINGS[0])).toBe(source);
	});

	it('preserves CRLF and columns when wrapping a lone migrated fret', () => {
		const source = 'E0\r\n 12 \r\n[12]\r\n';
		const migrated = migrateLegacySource(source, TUNINGS[0]);
		expect(migrated).toBe('E0\r\n| [12] |\r\n[12]\r\n');
		expect(parse(migrated, TUNINGS[0]).blocks).toEqual(parse(source, TUNINGS[0], 1).blocks);
	});
});

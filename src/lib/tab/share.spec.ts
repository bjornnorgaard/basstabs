import { describe, expect, it } from 'vitest';
import {
	buildShareUrl,
	decodeSharedTab,
	encodeSharedTab,
	payloadFromHash,
	requiredShareVersion
} from './share';

const tab = {
	title: 'Hysteria',
	artist: 'Muse',
	tuningId: 'standard-5',
	source: 'E0 0 A2 2 |\nE0 0 3 A2 |'
};

function decodedPayloadVersion(payload: string) {
	const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
	return new TextDecoder()
		.decode(
			Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (char) =>
				char.charCodeAt(0)
			)
		)
		.split('\n')[0];
}

describe('share links', () => {
	it('round-trips a tab', () => {
		expect(decodeSharedTab(encodeSharedTab(tab))).toEqual(tab);
	});
	it('migrates version 1 links without changing legacy pitches', () => {
		const payload = btoa('1\nOld tab\nArtist\nstandard-4\nE12 10 E320');
		expect(decodeSharedTab(payload)?.source).toBe('E[12] [10] E320');
	});

	it('keeps version 2 single-digit runs and bracketed frets unchanged', () => {
		const current = { ...tab, source: 'E12 E[12]3' };
		expect(decodeSharedTab(encodeSharedTab(current))).toEqual(current);
		expect(requiredShareVersion(current.source, current.tuningId)).toBe('2');
		expect(decodedPayloadVersion(encodeSharedTab(current))).toBe('2');
	});

	it('uses version 3 only when articulation syntax is present', () => {
		const articulated = { ...tab, source: String.raw`E5h7 E5b Ex E(5)|` };
		expect(requiredShareVersion(articulated.source, articulated.tuningId)).toBe('3');
		expect(decodedPayloadVersion(encodeSharedTab(articulated))).toBe('3');
		expect(decodeSharedTab(encodeSharedTab(articulated))).toEqual(articulated);
	});

	it('accepts version 3 payloads', () => {
		const payload = btoa(String.raw`3
Title
Artist
standard-4
E5\3 |`);
		expect(decodeSharedTab(payload)).toEqual({
			title: 'Title',
			artist: 'Artist',
			tuningId: 'standard-4',
			source: String.raw`E5\3 |`
		});
	});

	it('keeps the payload URL-safe', () => {
		expect(encodeSharedTab(tab)).toMatch(/^[\w-]+$/);
	});

	it('round-trips non-ascii text', () => {
		const fancy = { ...tab, title: 'Ærø – 日本語', artist: 'Bjørn' };
		expect(decodeSharedTab(encodeSharedTab(fancy))).toEqual(fancy);
	});

	it('round-trips empty fields', () => {
		const empty = { title: '', artist: '', tuningId: 'standard-4', source: '' };
		expect(decodeSharedTab(encodeSharedTab(empty))).toEqual(empty);
	});

	it('rejects junk payloads', () => {
		expect(decodeSharedTab('')).toBeNull();
		expect(decodeSharedTab('not a payload!!')).toBeNull();
		expect(decodeSharedTab(btoa('9\na\nb\nc\nd'))).toBeNull();
	});

	it('builds a shareable url with the payload in the hash', () => {
		const url = buildShareUrl('https://basstabs.bybear.dk/shared/', tab);
		expect(url.startsWith('https://basstabs.bybear.dk/shared#')).toBe(true);
		expect(decodeSharedTab(payloadFromHash(new URL(url).hash))).toEqual(tab);
	});
});

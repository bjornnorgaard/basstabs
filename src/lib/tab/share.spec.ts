import { describe, expect, it } from 'vitest';
import { buildShareUrl, decodeSharedTab, encodeSharedTab, payloadFromHash } from './share';

const tab = {
	title: 'Hysteria',
	artist: 'Muse',
	tuningId: 'standard-5',
	source: 'E0 0 A2 2 |\nE0 0 3 A2 |'
};

describe('share links', () => {
	it('round-trips a tab', () => {
		expect(decodeSharedTab(encodeSharedTab(tab))).toEqual(tab);
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

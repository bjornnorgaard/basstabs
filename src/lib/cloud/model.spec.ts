import { describe, expect, it } from 'vitest';
import { cloudData, readCloudTab, shareToken } from './model';

const data = {
	title: 'Riff',
	artist: 'Artist',
	tuningId: 'standard-4',
	source: 'E0 2',
	syntaxVersion: 2,
	createdAt: 1,
	updatedAt: 2,
	visibility: 'private',
	shareId: null
};

describe('cloud tab data', () => {
	it('round trips canonical tabs without storing their document id', () => {
		const tab = readCloudTab('id', data);
		expect(tab.id).toBe('id');
		expect(cloudData(tab)).toEqual(data);
		expect(cloudData(tab)).not.toHaveProperty('id');
	});

	it('rejects malformed and oversized data', () => {
		for (const changes of [
			{ title: 5 },
			{ artist: 'a'.repeat(201) },
			{ source: 'x'.repeat(200001) },
			{ tuningId: 'invalid' },
			{ syntaxVersion: 1 },
			{ createdAt: NaN },
			{ updatedAt: Infinity },
			{ visibility: 'invalid' },
			{ visibility: 'private', shareId: 'a'.repeat(32) },
			{ visibility: 'unlisted', shareId: null },
			{ visibility: 'public', shareId: 'guessable' }
		]) {
			expect(() => readCloudTab('id', { ...data, ...changes })).toThrow();
		}
	});

	it('accepts unlisted/public tabs with strong share tokens', () => {
		const token = shareToken();
		expect(token).toMatch(/^[a-f0-9]{32}$/);
		expect(shareToken()).not.toBe(token);
		for (const visibility of ['unlisted', 'public']) {
			expect(readCloudTab('id', { ...data, visibility, shareId: token }).shareId).toBe(token);
		}
	});
});

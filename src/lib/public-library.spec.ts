import { describe, expect, it } from 'vitest';
import { filterLoadedPublicTabs } from './public-library';
import type { CloudTab } from './cloud/model';

const tabs = [
	{ id: 'one', title: 'Walking Bass', artist: 'Carol Kaye' },
	{ id: 'two', title: 'Slap Riff', artist: '' },
	{ id: 'three', title: 'Pocket Groove', artist: 'Unknown Player' }
] as CloudTab[];

describe('filterLoadedPublicTabs', () => {
	it('filters loaded public tabs by title or artist', () => {
		expect(filterLoadedPublicTabs(tabs, 'walk').map((tab) => tab.id)).toEqual(['one']);
		expect(filterLoadedPublicTabs(tabs, 'kaye').map((tab) => tab.id)).toEqual(['one']);
		expect(filterLoadedPublicTabs(tabs, 'PLAYER').map((tab) => tab.id)).toEqual(['three']);
	});

	it('returns the loaded list unchanged for a blank query', () => {
		expect(filterLoadedPublicTabs(tabs, '   ')).toBe(tabs);
	});
});

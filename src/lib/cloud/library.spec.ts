import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { BassTab } from '$lib/stores/tabs.svelte';
import type { CloudTab } from './model';

const mocks = vi.hoisted(() => ({
	local: { tabs: [] as BassTab[] },
	cloud: {
		user: { uid: 'owner' },
		tabs: [] as CloudTab[],
		loading: false,
		connectionFailed: false,
		saving: [] as string[],
		dirty: [] as string[],
		movingToBrowser: [] as string[],
		uploadErrors: {} as Record<string, string>,
		get: vi.fn<(id: string) => CloudTab | undefined>()
	}
}));
vi.mock('$lib/stores/tabs.svelte', () => ({ tabStore: mocks.local }));
vi.mock('$lib/stores/cloud.svelte', () => ({ cloudStore: mocks.cloud }));
vi.mock('$app/paths', () => ({
	resolve: (path: string, params?: { id: string }) => path.replace('[id]', params?.id ?? '')
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/toaster', () => ({ toaster: { error: vi.fn(), success: vi.fn() } }));

import Library from '../../routes/+page.svelte';

const tab: BassTab = {
	id: 'browser',
	title: 'Browser riff',
	artist: '',
	source: 'E0',
	tuningId: 'standard-4',
	syntaxVersion: 2,
	createdAt: 1,
	updatedAt: 1
};

describe('unified tab library', () => {
	beforeEach(() => {
		mocks.local.tabs = [{ ...tab, browserOnly: true }];
		mocks.cloud.tabs = [
			{
				...tab,
				id: 'cloud',
				title: 'Cloud riff',
				updatedAt: 2,
				visibility: 'private',
				shareId: null
			}
		];
		mocks.cloud.get.mockImplementation((id) => mocks.cloud.tabs.find((item) => item.id === id));
		mocks.cloud.loading = false;
		mocks.cloud.connectionFailed = false;
		mocks.cloud.saving = [];
		mocks.cloud.dirty = [];
		mocks.cloud.uploadErrors = {};
	});

	it('lists browser and cloud tabs together, ordered by most recent edit', () => {
		const { body } = render(Library);
		expect(body.match(/<ul /g)).toHaveLength(1);
		expect(body.indexOf('Cloud riff')).toBeLessThan(body.indexOf('Browser riff'));
		expect(body).toContain('Browser only');
		expect(body).toContain('Saved to cloud');
		expect(body).toContain('Search tabs');
		expect(body).not.toContain('Your cloud tabs</h2>');
	});

	it('shows only one card when a promoted ID still exists in browser storage', () => {
		mocks.cloud.tabs[0].id = tab.id;
		const { body } = render(Library);
		expect(body.match(/<li /g)).toHaveLength(1);
		expect(body).toContain('Cloud riff');
		expect(body).not.toContain('Browser riff');
	});

	it('distinguishes pending and failed cloud uploads from opted-out browser tabs', () => {
		mocks.local.tabs[0].browserOnly = false;
		expect(render(Library).body).toContain('Cloud save pending · Browser backup kept');
		mocks.cloud.uploadErrors[tab.id] = 'offline';
		expect(render(Library).body).toContain('Cloud save failed · Browser backup kept');
		mocks.cloud.saving = [tab.id];
		expect(render(Library).body).toContain('Saving to cloud...');
	});

	it('exposes unsaved and saving cloud statuses without affecting browser-only tabs', () => {
		mocks.cloud.dirty = ['cloud'];
		expect(render(Library).body).toContain('Cloud · Unsaved changes');
		mocks.cloud.saving = ['cloud'];
		const { body } = render(Library);
		expect(body).toContain('Saving to cloud...');
		expect(body).toContain('Browser only');
	});

	it.each(['loading', 'connectionFailed'] as const)(
		'does not claim the library is empty when cloud state is %s',
		(state) => {
			mocks.local.tabs = [];
			mocks.cloud.tabs = [];
			mocks.cloud[state] = true;
			const { body } = render(Library);
			expect(body).not.toContain('No tabs yet');
			expect(body).not.toContain('No tabs match');
			expect(body).toContain(state === 'loading' ? 'Loading cloud tabs...' : 'Reconnect cloud');
		}
	);
});

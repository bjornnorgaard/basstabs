import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import type { BassTab } from '$lib/stores/tabs.svelte';

const mocks = vi.hoisted(() => {
	const tab: BassTab = {
		id: 'local',
		title: 'Broken riff',
		artist: 'The Bears',
		source: 'E0 [abc]',
		tuningId: 'standard-4',
		syntaxVersion: 2,
		createdAt: 1,
		updatedAt: 1,
		browserOnly: true
	};
	const tabStore = {
		get: vi.fn(() => tab),
		update: vi.fn((id: string, changes: Partial<BassTab>) => {
			if (id === tab.id) Object.assign(tab, changes);
		}),
		remove: vi.fn(() => undefined)
	};
	const cloudStore = {
		user: null,
		ready: true,
		loading: false,
		saving: [] as string[],
		movingToBrowser: [] as string[],
		get: vi.fn(() => undefined),
		create: vi.fn(() => tab),
		update: vi.fn(),
		remove: vi.fn(),
		keepBrowserOnly: vi.fn(),
		login: vi.fn()
	};
	return { cloudStore, tab, tabStore };
});

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('$app/state', () => ({
	page: { params: { id: 'local' }, url: new URL('https://example.test/tab/local') }
}));
vi.mock('$lib/stores/tabs.svelte', () => ({ tabStore: mocks.tabStore }));
vi.mock('$lib/stores/cloud.svelte', () => ({ cloudStore: mocks.cloudStore }));
vi.mock('$lib/toaster', () => ({ toaster: { error: vi.fn(), success: vi.fn() } }));
vi.mock('$lib/cloud/share', () => ({
	buildLiveShareUrl: vi.fn(() => Promise.resolve('https://example.test/shared?id=live'))
}));
vi.mock('$lib/audio/player.svelte', () => ({
	player: {
		playing: false,
		looping: false,
		bpm: 100,
		sourceTempoActive: false,
		activeBpm: 100,
		key: null,
		label: '',
		activeNoteId: null,
		activeMeasureId: null,
		play: vi.fn(),
		stop: vi.fn(),
		toggleLoop: vi.fn(),
		setBpm: vi.fn()
	}
}));

import TabPage from './+page.svelte';

describe('tab page component interactions', () => {
	it('shows a collapsed shorthand error badge', async () => {
		mocks.tab.source = 'E0 [abc]';
		localStorage.setItem('basstabs:editor', 'collapsed');

		const screen = await render(TabPage);

		await expect
			.element(screen.getByRole('button', { name: /shorthand editor 1 error/i }))
			.toBeVisible();
	});

	it('renders a print action that calls window.print', async () => {
		mocks.tab.source = 'E0 |';
		const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
		const screen = await render(TabPage);

		await screen.getByRole('button', { name: 'Print' }).click();

		expect(print).toHaveBeenCalledTimes(1);
	});

	it('inserts notation from the quick-insert menus', async () => {
		mocks.tab.source = 'E0 |';
		localStorage.setItem('basstabs:editor', 'open');
		const screen = await render(TabPage);

		await screen.getByRole('button', { name: /structure/i }).click();
		await screen.getByRole('menuitem', { name: /section heading/i }).click();

		await expect.poll(() => mocks.tab.source).toBe('[Section]\nE0 |');
		await expect
			.element(screen.getByRole('menuitem', { name: /section heading/i }))
			.not.toBeInTheDocument();
	});
});

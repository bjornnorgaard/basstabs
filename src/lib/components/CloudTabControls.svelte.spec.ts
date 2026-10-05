import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import type { BassTab } from '$lib/stores/tabs.svelte';
import type { CloudTab } from '$lib/cloud/model';

const mocks = vi.hoisted(() => {
	const cloudTab: CloudTab = {
		id: 'local',
		title: 'Cloud riff',
		artist: '',
		source: 'E0',
		tuningId: 'standard-4',
		syntaxVersion: 2,
		createdAt: 1,
		updatedAt: 1,
		visibility: 'private',
		shareId: null
	};
	const cloud = {
		user: { uid: 'owner' },
		tabs: [cloudTab],
		saving: [] as string[],
		dirty: [] as string[],
		movingToBrowser: [] as string[],
		uploadErrors: {} as Record<string, string>,
		busy: false,
		loading: false,
		connectionFailed: false,
		get: vi.fn<(id: string) => CloudTab | undefined>(() => cloudTab),
		keepBrowserOnly: vi.fn<(_id: string) => Promise<void>>(() => Promise.resolve()),
		login: vi.fn<() => Promise<void>>(() => Promise.resolve()),
		replaceFromLocal: vi.fn<(_tab: BassTab, _replaceId: string) => Promise<string>>(() =>
			Promise.resolve('local')
		),
		upload: vi.fn<(_tab: BassTab) => Promise<string>>(() => Promise.resolve('local')),
		setVisibility: vi.fn<(_id: string, _visibility: string) => Promise<void>>(() =>
			Promise.resolve()
		),
		save: vi.fn<(_id: string) => Promise<void>>(() => Promise.resolve())
	};
	return { cloud, cloudTab };
});

vi.mock('$lib/stores/cloud.svelte', () => ({ cloudStore: mocks.cloud }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('$app/state', () => ({ page: { url: new URL('https://example.test/tab/local') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/toaster', () => ({ toaster: { error: vi.fn(), success: vi.fn() } }));
vi.mock('$lib/cloud/share', () => ({
	buildLiveShareUrl: vi.fn(() => Promise.resolve('https://example.test/shared?id=live'))
}));

import CloudTabControls from '$lib/components/CloudTabControls.svelte';

const tab: BassTab = {
	id: 'local',
	title: 'Cloud riff',
	artist: '',
	source: 'E0',
	tuningId: 'standard-4',
	syntaxVersion: 2,
	createdAt: 1,
	updatedAt: 1
};

describe('CloudTabControls interactions', () => {
	it('confirms before moving a cloud tab to browser-only storage', async () => {
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const screen = await render(CloudTabControls, { props: { tab } });

		await screen.getByLabelText('Save location').selectOptions('browser');

		expect(confirm).toHaveBeenCalledWith(
			'Keep "Cloud riff" only in this browser? This removes it from your cloud account and revokes any live link. It will no longer be available on other devices.'
		);
		expect(mocks.cloud.keepBrowserOnly).not.toHaveBeenCalled();

		confirm.mockReturnValue(true);
		await screen.getByLabelText('Save location').selectOptions('browser');

		expect(mocks.cloud.keepBrowserOnly).toHaveBeenCalledTimes(1);
		expect(mocks.cloud.keepBrowserOnly).toHaveBeenCalledWith('local');
	});
});

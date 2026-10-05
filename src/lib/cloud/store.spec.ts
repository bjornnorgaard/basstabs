import { describe, expect, it, vi } from 'vitest';
import { mocks, store, tab } from './store.spec.fixtures';

describe('cloud store facade', () => {
	it('persists a browser-only tab before deleting the cloud tab and live projection', async () => {
		const cloud = await store();
		await cloud.setVisibility(tab.id, 'unlisted');
		const token = cloud.get(tab.id)?.shareId;
		cloud.update(tab.id, { source: 'E9' });
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		mocks.commit.mockImplementationOnce(async () => {
			expect(JSON.parse(localStorage.getItem('basstabs:tabs') ?? '[]')[0]).toMatchObject({
				id: tab.id,
				browserOnly: true,
				source: 'E9'
			});
		});
		await cloud.keepBrowserOnly(tab.id);
		expect(mocks.delete).toHaveBeenCalledWith(`users/owner/tabs/${tab.id}`);
		expect(mocks.delete).toHaveBeenCalledWith(`publishedTabs/${token}`);
		expect(tabStore.get(tab.id)).toMatchObject({ browserOnly: true, source: 'E9' });
		expect(cloud.get(tab.id)).toBeUndefined();
		expect(cloud.dirty).toEqual([]);
		cloud.loading = false;
		await cloud.syncBrowserTabs();
		expect(cloud.get(tab.id)).toBeUndefined();
	});

	it('does not delete a cloud tab if persisting the browser version fails', async () => {
		const cloud = await store();
		vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
			throw new Error('storage full');
		});
		await expect(cloud.keepBrowserOnly(tab.id)).rejects.toThrow('storage full');
		expect(mocks.commit).not.toHaveBeenCalled();
		expect(mocks.delete).not.toHaveBeenCalled();
		expect(cloud.get(tab.id)).toBeDefined();
	});

	it('keeps both versions and reports failure if cloud deletion fails', async () => {
		const cloud = await store();
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		mocks.commit.mockRejectedValueOnce(new Error('offline'));
		await expect(cloud.keepBrowserOnly(tab.id)).rejects.toThrow('offline');
		expect(tabStore.get(tab.id)).toMatchObject({ browserOnly: true, source: 'E0' });
		expect(cloud.get(tab.id)).toBeDefined();
		expect(cloud.movingToBrowser).toEqual([]);
	});

	it('keeps edits made during a cloud-to-browser move and does not queue another cloud save', async () => {
		const cloud = await store();
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		let finish!: () => void;
		mocks.commit.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		const moving = cloud.keepBrowserOnly(tab.id);
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		cloud.update(tab.id, { source: 'E8' });
		expect(tabStore.get(tab.id)?.source).toBe('E8');
		finish();
		await moving;
		expect(JSON.parse(localStorage.getItem('basstabs:tabs') ?? '[]')[0].source).toBe('E8');
		expect(cloud.get(tab.id)).toBeUndefined();
		expect(cloud.dirty).toEqual([]);
		expect(mocks.commit).toHaveBeenCalledTimes(1);
	});

	it('mirrors edits under the same stable share token', async () => {
		const cloud = await store();
		await cloud.setVisibility(tab.id, 'unlisted');
		const token = cloud.get(tab.id)?.shareId;
		cloud.update(tab.id, { source: 'E3' });
		await cloud.save(tab.id);
		expect(cloud.get(tab.id)?.shareId).toBe(token);
		expect(mocks.set).toHaveBeenLastCalledWith(
			`publishedTabs/${token}`,
			expect.objectContaining({ source: 'E3', ownerId: 'owner', tabId: tab.id })
		);
		expect(cloud.dirty).toEqual([]);
	});

	it('enables unlisted visibility when preparing a private tab for link sharing', async () => {
		const cloud = await store();
		const { buildLiveShareUrl } = await import('./share');
		const url = new URL(await buildLiveShareUrl('https://example.com/shared', tab.id));
		expect(cloud.get(tab.id)?.visibility).toBe('unlisted');
		expect(url.searchParams.get('id')).toBe(cloud.get(tab.id)?.shareId);
		expect(url.hash).toBe('');
		expect(mocks.set).toHaveBeenLastCalledWith(
			`publishedTabs/${cloud.get(tab.id)?.shareId}`,
			expect.objectContaining({ visibility: 'unlisted' })
		);
	});

	it.each(['public', 'unlisted'] as const)(
		'keeps %s visibility and the existing token when preparing a live link',
		async (visibility) => {
			const cloud = await store();
			await cloud.setVisibility(tab.id, visibility);
			const token = cloud.get(tab.id)?.shareId;
			cloud.update(tab.id, { source: 'E5' });
			const { buildLiveShareUrl } = await import('./share');
			const url = new URL(await buildLiveShareUrl('https://example.com/shared', tab.id));
			expect(cloud.get(tab.id)?.visibility).toBe(visibility);
			expect(url.searchParams.get('id')).toBe(token);
			expect(cloud.dirty).toEqual([]);
			expect(mocks.set).toHaveBeenLastCalledWith(
				`publishedTabs/${token}`,
				expect.objectContaining({ visibility, source: 'E5' })
			);
		}
	);

	it('does not return a live link and restores visibility when enabling sharing fails', async () => {
		const cloud = await store();
		mocks.commit.mockResolvedValueOnce().mockRejectedValueOnce(new Error('offline'));
		const { buildLiveShareUrl } = await import('./share');
		await expect(buildLiveShareUrl('https://example.com/shared', tab.id)).rejects.toThrow(
			'offline'
		);
		expect(cloud.get(tab.id)?.visibility).toBe('private');
		expect(cloud.get(tab.id)?.shareId).toBeNull();
	});

	it('revokes the old link and generates a different token when sharing again', async () => {
		const cloud = await store();
		await cloud.setVisibility(tab.id, 'unlisted');
		const old = cloud.get(tab.id)?.shareId;
		await cloud.setVisibility(tab.id, 'private');
		expect(mocks.delete).toHaveBeenCalledWith(`publishedTabs/${old}`);
		await cloud.setVisibility(tab.id, 'public');
		expect(cloud.get(tab.id)?.shareId).not.toBe(old);
	});

	it('retains dirty edits and refuses sign-out on failed writes', async () => {
		const cloud = await store();
		cloud.update(tab.id, { source: 'E7' });
		mocks.commit.mockRejectedValue(new Error('offline'));
		await cloud.logout();
		expect(cloud.dirty).toContain(tab.id);
		expect(cloud.get(tab.id)?.source).toBe('E7');
		expect(cloud.error).toContain('offline');
		expect(mocks.signOut).not.toHaveBeenCalled();
	});

	it('does not mark edits made during an in-flight save as saved', async () => {
		const cloud = await store();
		cloud.update(tab.id, { source: 'E1' });
		let finish!: () => void;
		mocks.commit.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		const saving = cloud.save(tab.id);
		cloud.update(tab.id, { source: 'E2' });
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		finish();
		await saving;
		expect(cloud.dirty).toContain(tab.id);
		expect(cloud.get(tab.id)?.source).toBe('E2');
		await cloud.save(tab.id);
		expect(cloud.dirty).toEqual([]);
	});

	it('rejects a known duplicate before any Firestore request, even if access is denied', async () => {
		const cloud = await store();
		mocks.get.mockRejectedValueOnce(
			Object.assign(new Error('Missing or insufficient permissions.'), {
				code: 'permission-denied'
			})
		);
		await expect(cloud.upload({ ...tab, id: 'local-id', title: ' riff ' })).rejects.toThrow(
			"You can't have two cloud saves with the same title"
		);
		expect(mocks.get).not.toHaveBeenCalled();
		expect(mocks.library).not.toHaveBeenCalled();
		expect(mocks.commit).not.toHaveBeenCalled();
	});

	it('allows a local variation once its title changes, while keeping server validation', async () => {
		const cloud = await store();
		await expect(cloud.upload(tab)).rejects.toThrow('different title');
		const id = await cloud.upload({ ...tab, id: 'local-id', title: 'Riff 2' });
		expect(cloud.get(id)?.title).toBe('Riff 2');
		expect(mocks.library).toHaveBeenCalledWith('users/owner/tabs');
	});

	it('rejects duplicate cloud renames and preserves the unsaved draft', async () => {
		const cloud = await store();
		mocks.library.mockResolvedValue({
			docs: [
				{ id: tab.id, data: () => tab },
				{ id: 'other-tab', data: () => ({ ...tab, title: 'Variation' }) }
			]
		});
		cloud.update(tab.id, { title: ' variation ' });
		await expect(cloud.save(tab.id)).rejects.toThrow('different title');
		expect(cloud.dirty).toContain(tab.id);
		expect(mocks.commit).not.toHaveBeenCalled();
		cloud.update(tab.id, { title: 'Variation 2' });
		await cloud.save(tab.id);
		expect(cloud.dirty).toEqual([]);
	});

	it('allows a case-only rename of the same tab', async () => {
		const cloud = await store();
		mocks.library.mockResolvedValue({ docs: [{ id: tab.id, data: () => tab }] });
		cloud.update(tab.id, { title: 'RIFF' });
		await cloud.save(tab.id);
		expect(cloud.dirty).toEqual([]);
	});

	it('does not scan the library for content-only edits', async () => {
		const cloud = await store();
		cloud.update(tab.id, { source: 'E4' });
		await cloud.save(tab.id);
		expect(mocks.library).not.toHaveBeenCalled();
	});

	it('surfaces failed server checks without creating a copy', async () => {
		const cloud = await store();
		cloud.tabs = [];
		mocks.library.mockRejectedValueOnce(new Error('offline'));
		await expect(cloud.upload({ ...tab, id: 'local-id' })).rejects.toThrow('offline');
		expect(mocks.commit).not.toHaveBeenCalled();
	});
});

import { describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { mocks, store, tab, user } from './store.spec.fixtures';

describe('cloud upload queue', () => {
	it('automatically promotes existing browser tabs after the signed-in library loads', async () => {
		const cloud = await store();
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Local song' });
		await cloud.syncBrowserTabs();
		expect(cloud.get(local.id)).toBeUndefined();
		cloud.loading = false;
		await cloud.syncBrowserTabs();
		expect(cloud.get(local.id)).toMatchObject({ title: 'Local song', visibility: 'private' });
		expect(tabStore.get(local.id)).toBeUndefined();
	});

	it('does not automatically upload while signed out or cloud access has failed', async () => {
		const cloud = await store();
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Local song' });
		cloud.loading = false;
		cloud.connectionFailed = true;
		await cloud.syncBrowserTabs();
		expect(mocks.commit).not.toHaveBeenCalled();
		mocks.authChange?.(null);
		await cloud.syncBrowserTabs();
		expect(tabStore.get(local.id)).toBeDefined();
		expect(mocks.commit).not.toHaveBeenCalled();
	});

	it('persists opt-out and skips it across sign-out, sign-in, and local edits', async () => {
		const cloud = await store();
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Local song' });
		await cloud.keepBrowserOnly(local.id);
		expect(JSON.parse(localStorage.getItem('basstabs:tabs') ?? '[]')[0].browserOnly).toBe(true);
		mocks.authChange?.(null);
		mocks.authChange?.(user);
		cloud.loading = false;
		tabStore.update(local.id, { source: 'E9' });
		await cloud.syncBrowserTabs();
		expect(tabStore.get(local.id)).toMatchObject({ browserOnly: true, source: 'E9' });
		expect(mocks.commit).not.toHaveBeenCalled();
	});

	it('uses cloud saving by default for new tabs and gives repeated creations unique titles', async () => {
		const cloud = await store();
		cloud.loading = false;
		const first = cloud.create();
		const second = cloud.create();
		const imported = cloud.create({ title: 'Riff', source: 'E9' });
		expect(first).toMatchObject({ title: 'Untitled tab', cloudOwnerId: 'owner' });
		expect(second.title).toBe('Untitled tab (2)');
		expect(imported).toMatchObject({ title: 'Riff (2)', source: 'E9' });
		await cloud.syncBrowserTabs();
		expect(cloud.get(first.id)).toBeDefined();
		expect(cloud.get(second.id)).toBeDefined();
		expect(cloud.get(imported.id)).toBeDefined();
	});

	it('drains new tabs created while an earlier automatic upload is still running', async () => {
		const cloud = await store();
		cloud.loading = false;
		const first = cloud.create({ title: 'First song' });
		let finish!: () => void;
		mocks.commit.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		const syncing = cloud.syncBrowserTabs();
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		const second = cloud.create({ title: 'Second song' });
		const next = cloud.syncBrowserTabs();
		finish();
		await Promise.all([syncing, next]);
		expect(cloud.get(first.id)).toBeDefined();
		expect(cloud.get(second.id)).toBeDefined();
		expect(mocks.commit).toHaveBeenCalledTimes(2);
	});

	it('does not overwrite title conflicts during automatic sign-in uploads', async () => {
		const cloud = await store();
		cloud.loading = false;
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: ' riff ', source: 'E9' });
		await cloud.syncBrowserTabs();
		expect(cloud.get(tab.id)?.source).toBe('E0');
		expect(tabStore.get(local.id)?.source).toBe('E9');
		expect(cloud.uploadErrors[local.id]).toContain('same title');
		expect(cloud.error).toContain('browser version was kept');
		expect(mocks.commit).not.toHaveBeenCalled();
	});

	it('reports failed automatic saves without looping and retries after editing', async () => {
		const cloud = await store();
		cloud.loading = false;
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = cloud.create({ title: 'New song' });
		mocks.commit.mockRejectedValueOnce(new Error('offline'));
		await cloud.syncBrowserTabs();
		expect(cloud.uploadErrors[local.id]).toBe('offline');
		expect(tabStore.get(local.id)).toMatchObject({ cloudOwnerId: 'owner' });
		await cloud.syncBrowserTabs();
		expect(mocks.commit).toHaveBeenCalledTimes(1);
		tabStore.update(local.id, { source: 'E9' });
		await cloud.syncBrowserTabs();
		expect(cloud.get(local.id)?.source).toBe('E9');
		expect(cloud.uploadErrors[local.id]).toBeUndefined();
	});

	it('does not upload a pending tab into a different account', async () => {
		const cloud = await store();
		const local = cloud.create({ title: 'New song' });
		mocks.authChange?.({ uid: 'another-owner' } as User);
		cloud.loading = false;
		await cloud.syncBrowserTabs();
		expect(mocks.commit).not.toHaveBeenCalled();
		await expect(cloud.upload(local)).rejects.toThrow('another account');
	});

	it('saves opted-out tabs to the cloud again only when explicitly enabled', async () => {
		const cloud = await store();
		cloud.loading = false;
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Local song', browserOnly: true });
		await cloud.syncBrowserTabs();
		expect(mocks.commit).not.toHaveBeenCalled();
		await cloud.upload(local);
		expect(tabStore.get(local.id)).toBeUndefined();
		expect(cloud.get(local.id)?.title).toBe('Local song');
	});

	it('enables cloud saving on the same tab and persistently removes the browser-only entry', async () => {
		const cloud = await store();
		cloud.tabs = [];
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Riff', source: 'E0' });
		const id = await cloud.upload(local);
		expect(id).toBe(local.id);
		expect(tabStore.get(id)).toBeUndefined();
		expect(JSON.parse(localStorage.getItem('basstabs:tabs') ?? 'null')).toEqual([]);
		expect(cloud.get(id)?.source).toBe('E0');
		expect(mocks.set).toHaveBeenCalledWith(
			`users/owner/tabs/${id}`,
			expect.objectContaining({ visibility: 'private', shareId: null })
		);
		expect(mocks.library).toHaveBeenCalledWith('users/owner/tabs');
		expect(mocks.delete).not.toHaveBeenCalled();
	});

	it('keeps the browser tab if enabling cloud saving fails', async () => {
		const cloud = await store();
		cloud.tabs = [];
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Riff', source: 'E7' });
		mocks.commit.mockRejectedValueOnce(new Error('offline'));
		await expect(cloud.upload(local)).rejects.toThrow('offline');
		expect(tabStore.get(local.id)?.source).toBe('E7');
		expect(cloud.tabs).toEqual([]);
		expect(cloud.saving).toEqual([]);
	});

	it('preserves edits made in the browser while cloud saving is being enabled', async () => {
		const cloud = await store();
		cloud.tabs = [];
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Riff', source: 'E0' });
		let finish!: () => void;
		mocks.commit.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		const uploading = cloud.upload(local);
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		tabStore.update(local.id, { source: 'E9' });
		finish();
		await uploading;
		expect(tabStore.get(local.id)).toBeUndefined();
		expect(cloud.get(local.id)?.source).toBe('E9');
		expect(cloud.dirty).toContain(local.id);
		expect(localStorage.getItem('basstabs:cloud-drafts:owner')).toContain('E9');
		await cloud.save(local.id);
		expect(cloud.dirty).toEqual([]);
	});

	it('keeps the browser tab if the account changes during upload', async () => {
		const cloud = await store();
		cloud.tabs = [];
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Riff' });
		let finish!: () => void;
		mocks.commit.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		const uploading = cloud.upload(local);
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		mocks.authChange?.({ uid: 'other' } as User);
		finish();
		await expect(uploading).rejects.toThrow('previous account');
		expect(tabStore.get(local.id)).toBeDefined();
		expect(cloud.tabs).toEqual([]);
	});

	it('keeps newer browser edits when their cloud draft cannot be backed up', async () => {
		const cloud = await store();
		cloud.tabs = [];
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Riff', source: 'E0' });
		let finish!: () => void;
		mocks.commit.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		const uploading = cloud.upload(local);
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		tabStore.update(local.id, { source: 'E9' });
		vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
			throw new Error('storage full');
		});
		finish();
		await expect(uploading).rejects.toThrow('newer edits could not be backed up');
		expect(tabStore.get(local.id)?.source).toBe('E9');
		expect(cloud.get(local.id)?.source).toBe('E9');
		expect(cloud.error).toContain('storage full');
		await cloud.save(local.id);
	});

	it('does not overwrite an existing server tab with the same ID during promotion', async () => {
		const cloud = await store();
		cloud.tabs = [];
		await expect(cloud.upload(tab)).rejects.toThrow('already saved');
		expect(mocks.commit).not.toHaveBeenCalled();
		expect(mocks.set).not.toHaveBeenCalled();
	});

	it('updates an older cloud copy in place, preserving its sharing and creation date', async () => {
		const cloud = await store();
		await cloud.setVisibility(tab.id, 'unlisted');
		const token = cloud.get(tab.id)?.shareId;
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Riff', artist: 'Bear', source: 'E8' });
		const id = await cloud.replaceFromLocal(local, tab.id);
		expect(id).toBe(tab.id);
		expect(cloud.tabs).toHaveLength(1);
		expect(cloud.get(id)).toMatchObject({
			artist: 'Bear',
			source: 'E8',
			createdAt: tab.createdAt,
			visibility: 'unlisted',
			shareId: token
		});
		expect(tabStore.get(local.id)).toBeUndefined();
		expect(mocks.set).toHaveBeenLastCalledWith(
			`publishedTabs/${token}`,
			expect.objectContaining({ source: 'E8', tabId: tab.id })
		);
	});

	it('keeps both versions recoverable if updating an older copy fails', async () => {
		const cloud = await store();
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Riff', source: 'E8' });
		mocks.commit.mockRejectedValueOnce(new Error('offline'));
		await expect(cloud.replaceFromLocal(local, tab.id)).rejects.toThrow('offline');
		expect(tabStore.get(local.id)?.source).toBe('E8');
		expect(cloud.dirty).toContain(tab.id);
		expect(mocks.set).not.toHaveBeenCalled();
	});

	it('surfaces browser storage failures instead of claiming the local entry was removed', async () => {
		const cloud = await store();
		cloud.tabs = [];
		const { tabStore } = await import('$lib/stores/tabs.svelte');
		const local = tabStore.create({ title: 'Riff' });
		vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
			throw new Error('storage full');
		});
		await expect(cloud.upload(local)).rejects.toThrow('storage full');
		expect(tabStore.get(local.id)).toBeDefined();
		expect(cloud.get(local.id)).toBeUndefined();
		expect(mocks.commit).not.toHaveBeenCalled();
	});
});

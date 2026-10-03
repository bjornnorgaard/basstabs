import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { CloudTab } from './model';

const mocks = vi.hoisted(() => ({
	authChange: undefined as ((user: User | null) => void) | undefined,
	commit: vi.fn<() => Promise<void>>(),
	set: vi.fn(),
	delete: vi.fn(),
	get: vi.fn(),
	library: vi.fn(),
	signOut: vi.fn(),
	onSnapshot: vi.fn<
		(path: unknown, next: unknown, error: (error: { code: string }) => void) => () => void
	>(() => vi.fn())
}));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/firebase', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({
	GoogleAuthProvider: class {},
	onAuthStateChanged: (_auth: unknown, callback: (user: User | null) => void) => {
		mocks.authChange = callback;
	},
	signInWithPopup: vi.fn(),
	signOut: mocks.signOut
}));
vi.mock('firebase/firestore', () => ({
	collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
	doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
	onSnapshot: mocks.onSnapshot,
	getDocsFromServer: mocks.library,
	increment: (value: number) => ({ increment: value }),
	runTransaction: async (_db: unknown, action: (transaction: unknown) => Promise<void>) => {
		const writes: unknown[][] = [];
		const deletes: unknown[][] = [];
		await action({
			get: mocks.get,
			set: (...args: unknown[]) => writes.push(args),
			delete: (...args: unknown[]) => deletes.push(args)
		});
		await mocks.commit();
		for (const args of writes) mocks.set(...args);
		for (const args of deletes) mocks.delete(...args);
	},
	writeBatch: () => ({ set: mocks.set, delete: mocks.delete, commit: mocks.commit })
}));

const user = { uid: 'owner' } as User;
const tab: CloudTab = {
	id: 'cloud-id',
	title: 'Riff',
	artist: '',
	source: 'E0',
	tuningId: 'standard-4',
	syntaxVersion: 2,
	createdAt: 1,
	updatedAt: 2,
	visibility: 'private',
	shareId: null
};

describe('optional cloud store', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.stubGlobal('window', { addEventListener: vi.fn() });
		const storage = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key)
		});
		mocks.commit.mockResolvedValue();
		mocks.get.mockReset();
		mocks.get.mockImplementation(async (path: string) => ({
			exists: () => path === `users/owner/tabs/${tab.id}`,
			data: () => (path === `users/owner/tabs/${tab.id}` ? tab : undefined)
		}));
		mocks.library.mockResolvedValue({ docs: [] });
	});

	async function store() {
		const { cloudStore } = await import('$lib/stores/cloud.svelte');
		mocks.authChange?.(user);
		cloudStore.tabs = [{ ...tab }];
		return cloudStore;
	}

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

	it('waits for automatic uploads before signing out and refuses sign-out after a failed upload', async () => {
		const cloud = await store();
		cloud.loading = false;
		const first = cloud.create({ title: 'First song' });
		await cloud.logout();
		expect(cloud.get(first.id)).toBeDefined();
		expect(mocks.signOut).toHaveBeenCalledTimes(1);
		mocks.signOut.mockClear();
		const second = cloud.create({ title: 'Second song' });
		mocks.commit.mockRejectedValueOnce(new Error('offline'));
		await cloud.logout();
		expect(cloud.uploadErrors[second.id]).toBe('offline');
		expect(mocks.signOut).not.toHaveBeenCalled();
		expect(cloud.error).toContain('Browser only under Save location');
		await cloud.keepBrowserOnly(second.id);
		await cloud.logout();
		expect(mocks.signOut).toHaveBeenCalledTimes(1);
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

	it('clears account tabs on sign-out and rejects unauthenticated uploads', async () => {
		const cloud = await store();
		mocks.authChange?.(null);
		expect(cloud.tabs).toEqual([]);
		await expect(cloud.upload(tab)).rejects.toThrow('Sign in');
	});

	it.each(['Riff', ' riff ', 'RIFF'])(
		'rejects duplicate upload title %s from the server',
		async (title) => {
			const cloud = await store();
			cloud.tabs = [];
			mocks.library.mockResolvedValue({ docs: [{ id: tab.id, data: () => tab }] });
			await expect(cloud.upload({ ...tab, id: 'local-id', title })).rejects.toThrow(
				'different title'
			);
			expect(mocks.commit).not.toHaveBeenCalled();
			expect(cloud.tabs).toEqual([]);
		}
	);

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

	it('restores unsaved drafts only for the matching account', async () => {
		const cloud = await store();
		cloud.update(tab.id, { source: 'E9' });
		mocks.authChange?.({ uid: 'another-owner' } as User);
		expect(cloud.tabs).toEqual([]);
		mocks.authChange?.(user);
		expect(cloud.get(tab.id)?.source).toBe('E9');
		expect(cloud.dirty).toContain(tab.id);
		await cloud.save(tab.id);
		expect(localStorage.getItem('basstabs:cloud-drafts:owner')).toBeNull();
	});

	it('can delete a tab even when its unsaved draft is invalid', async () => {
		const cloud = await store();
		cloud.update(tab.id, { title: 'x'.repeat(201) });
		await cloud.remove(tab.id);
		expect(mocks.delete).toHaveBeenCalledWith(`users/owner/tabs/${tab.id}`);
		expect(mocks.set).not.toHaveBeenCalled();
		expect(cloud.tabs).toEqual([]);
		expect(cloud.dirty).toEqual([]);
	});

	it('explains denied cloud reads and reconnects without discarding drafts', async () => {
		const cloud = await store();
		cloud.update(tab.id, { source: 'E8' });
		const subscription = mocks.onSnapshot.mock.calls.at(-1);
		expect(subscription).toBeDefined();
		subscription?.[2]({ code: 'permission-denied' });
		expect(cloud.connectionFailed).toBe(true);
		expect(cloud.loading).toBe(false);
		expect(cloud.error).toContain('Google sign-in succeeded');
		expect(cloud.error).toContain('(default)');
		expect(cloud.error).toContain('basstabs-by-bear');
		cloud.connect();
		expect(mocks.onSnapshot).toHaveBeenCalledTimes(2);
		expect(cloud.connectionFailed).toBe(false);
		expect(cloud.loading).toBe(true);
		expect(cloud.get(tab.id)?.source).toBe('E8');
		expect(cloud.dirty).toContain(tab.id);
		await cloud.save(tab.id);
	});
});

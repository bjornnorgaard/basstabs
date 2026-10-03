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

	it('uploads a separate private copy, leaving the original untouched', async () => {
		const cloud = await store();
		cloud.tabs = [];
		const id = await cloud.upload(tab);
		expect(id).not.toBe(tab.id);
		expect(tab.visibility).toBe('private');
		expect(mocks.set).toHaveBeenCalledWith(
			`users/owner/tabs/${id}`,
			expect.objectContaining({ visibility: 'private', shareId: null })
		);
		expect(mocks.library).toHaveBeenCalledWith('users/owner/tabs');
		expect(mocks.delete).not.toHaveBeenCalled();
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
			await expect(cloud.upload({ ...tab, title })).rejects.toThrow('different title');
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
		const id = await cloud.upload({ ...tab, title: 'Riff 2' });
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
		await expect(cloud.upload(tab)).rejects.toThrow('offline');
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

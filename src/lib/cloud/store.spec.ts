import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { CloudTab } from './model';

const mocks = vi.hoisted(() => ({
	authChange: undefined as ((user: User | null) => void) | undefined,
	commit: vi.fn<() => Promise<void>>(),
	set: vi.fn(),
	delete: vi.fn(),
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
	});

	async function store() {
		const { cloudStore } = await import('$lib/stores/cloud.svelte');
		mocks.authChange?.(user);
		cloudStore.tabs = [{ ...tab }];
		return cloudStore;
	}

	it('uploads a separate private copy, leaving the original untouched', async () => {
		const cloud = await store();
		const id = await cloud.upload(tab);
		expect(id).not.toBe(tab.id);
		expect(tab.visibility).toBe('private');
		expect(mocks.set.mock.calls[0][0]).toBe(`users/owner/tabs/${id}`);
		expect(mocks.set.mock.calls[0][1]).toMatchObject({ visibility: 'private', shareId: null });
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

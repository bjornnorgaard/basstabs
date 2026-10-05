import { beforeEach, expect, vi } from 'vitest';
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
	clearCache: vi.fn<() => Promise<void>>(),
	onSnapshot: vi.fn<
		(
			path: unknown,
			options: { includeMetadataChanges: boolean },
			next: (snapshot: {
				docs: { id: string; data: () => CloudTab }[];
				metadata: { fromCache: boolean; hasPendingWrites: boolean };
			}) => void,
			error: (error: { code: string }) => void
		) => () => void
	>(() => vi.fn())
}));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/firebase', () => {
	const firebase = {
		auth: {},
		db: {},
		authSdk: {
			GoogleAuthProvider: class {},
			onAuthStateChanged: (_auth: unknown, callback: (user: User | null) => void) => {
				mocks.authChange = callback;
				return vi.fn();
			},
			signInWithPopup: vi.fn(),
			signOut: mocks.signOut
		},
		firestoreSdk: {
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
			writeBatch: () => {
				const writes: unknown[][] = [];
				const deletes: unknown[][] = [];
				return {
					set: (...args: unknown[]) => writes.push(args),
					delete: (...args: unknown[]) => deletes.push(args),
					commit: async () => {
						await mocks.commit();
						for (const args of writes) mocks.set(...args);
						for (const args of deletes) mocks.delete(...args);
					}
				};
			}
		},
		firestoreCache: 'persistent'
	};
	return {
		clearCachedFirestoreData: mocks.clearCache,
		getCachedFirebase: vi.fn(() => firebase),
		getFirebase: vi.fn(async () => firebase),
		prewarmFirebase: vi.fn(async () => firebase)
	};
});

export const user = { uid: 'owner' } as User;
export const tab: CloudTab = {
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
	mocks.clearCache.mockResolvedValue();
	mocks.get.mockReset();
	mocks.get.mockImplementation(async (path: string) => ({
		exists: () => path === `users/owner/tabs/${tab.id}`,
		data: () => (path === `users/owner/tabs/${tab.id}` ? tab : undefined)
	}));
	mocks.library.mockResolvedValue({ docs: [] });
});

export async function store() {
	localStorage.setItem('basstabs:had-session', '1');
	const { cloudStore } = await import('$lib/stores/cloud.svelte');
	await cloudStore.ensure();
	mocks.authChange?.(user);
	await vi.waitFor(() => expect(mocks.onSnapshot).toHaveBeenCalled());
	cloudStore.tabs = [{ ...tab }];
	return cloudStore;
}

export { mocks };

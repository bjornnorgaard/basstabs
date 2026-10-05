import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	app: { name: '[DEFAULT]' },
	auth: {},
	persistentDb: { kind: 'persistent' },
	memoryDb: { kind: 'memory' },
	nextDb: { kind: 'next' },
	initializeApp: vi.fn(),
	getApps: vi.fn(),
	getAuth: vi.fn(),
	initializeFirestore: vi.fn(),
	getFirestore: vi.fn(),
	persistentLocalCache: vi.fn(),
	persistentMultipleTabManager: vi.fn(),
	terminate: vi.fn(),
	clearIndexedDbPersistence: vi.fn()
}));

vi.mock('firebase/app', () => ({
	initializeApp: mocks.initializeApp,
	getApps: mocks.getApps
}));

vi.mock('firebase/auth', () => ({
	getAuth: mocks.getAuth
}));

vi.mock('firebase/firestore', () => ({
	initializeFirestore: mocks.initializeFirestore,
	getFirestore: mocks.getFirestore,
	persistentLocalCache: mocks.persistentLocalCache,
	persistentMultipleTabManager: mocks.persistentMultipleTabManager,
	terminate: mocks.terminate,
	clearIndexedDbPersistence: mocks.clearIndexedDbPersistence
}));

describe('Firebase lazy initialization', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.initializeApp.mockReturnValue(mocks.app);
		mocks.getApps.mockReturnValue([]);
		mocks.getAuth.mockReturnValue(mocks.auth);
		mocks.initializeFirestore.mockReturnValue(mocks.persistentDb);
		mocks.getFirestore.mockReturnValue(mocks.memoryDb);
		mocks.persistentMultipleTabManager.mockReturnValue('multi-tab-manager');
		mocks.persistentLocalCache.mockReturnValue('persistent-cache');
		mocks.terminate.mockResolvedValue(undefined);
		mocks.clearIndexedDbPersistence.mockResolvedValue(undefined);
	});

	it('initializes Firestore with persistent multi-tab cache', async () => {
		const { getFirebase } = await import('./firebase');
		const firebase = await getFirebase();

		expect(firebase.db).toBe(mocks.persistentDb);
		expect(firebase.firestoreCache).toBe('persistent');
		expect(mocks.initializeFirestore).toHaveBeenCalledWith(mocks.app, {
			localCache: 'persistent-cache'
		});
		expect(mocks.persistentLocalCache).toHaveBeenCalledWith({
			tabManager: 'multi-tab-manager'
		});
		expect(mocks.getFirestore).not.toHaveBeenCalled();
	});

	it('falls back to default cache when persistent cache is unavailable', async () => {
		mocks.initializeFirestore.mockImplementation(() => {
			throw Object.assign(new Error('Persistence unavailable'), { code: 'unimplemented' });
		});
		const { getFirebase } = await import('./firebase');
		const firebase = await getFirebase();

		expect(firebase.db).toBe(mocks.memoryDb);
		expect(firebase.firestoreCache).toBe('memory');
		expect(mocks.getFirestore).toHaveBeenCalledWith(mocks.app);
	});

	it('terminates and clears cached Firestore data for sign-out', async () => {
		mocks.initializeFirestore
			.mockReturnValueOnce(mocks.persistentDb)
			.mockReturnValueOnce(mocks.nextDb);
		const { clearCachedFirestoreData, getFirebase, getCachedFirebase } = await import('./firebase');
		await getFirebase();
		await clearCachedFirestoreData();

		expect(mocks.terminate).toHaveBeenCalledWith(mocks.persistentDb);
		expect(mocks.clearIndexedDbPersistence).toHaveBeenCalledWith(mocks.persistentDb);
		expect(getCachedFirebase()?.db).toBe(mocks.nextDb);
		expect(getCachedFirebase()?.firestoreCache).toBe('persistent');
	});
});

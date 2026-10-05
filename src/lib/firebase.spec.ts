import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	app: { name: '[DEFAULT]' },
	auth: {},
	persistentDb: { kind: 'persistent' },
	memoryDb: { kind: 'memory' },
	nextDb: { kind: 'next' },
	appCheck: { kind: 'app-check' },
	env: {} as Record<string, string | undefined>,
	initializeApp: vi.fn(),
	getApps: vi.fn(),
	initializeAppCheck: vi.fn(),
	ReCaptchaEnterpriseProvider: vi.fn(),
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

vi.mock('firebase/app-check', () => ({
	initializeAppCheck: mocks.initializeAppCheck,
	ReCaptchaEnterpriseProvider: mocks.ReCaptchaEnterpriseProvider
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

vi.mock('$env/dynamic/public', () => ({
	env: mocks.env
}));

describe('Firebase lazy initialization', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.unstubAllEnvs();
		delete mocks.env.PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
		delete mocks.env.PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN;
		Object.defineProperty(globalThis, 'self', {
			configurable: true,
			value: {}
		});
		mocks.initializeApp.mockReturnValue(mocks.app);
		mocks.getApps.mockReturnValue([]);
		mocks.initializeAppCheck.mockReturnValue(mocks.appCheck);
		mocks.ReCaptchaEnterpriseProvider.mockImplementation(function (
			this: { siteKey: string },
			siteKey: string
		) {
			this.siteKey = siteKey;
		});
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

	it('does not initialize App Check when no site key is configured', async () => {
		const { getFirebase } = await import('./firebase');
		const firebase = await getFirebase();

		expect(firebase.appCheck).toBeUndefined();
		expect(mocks.ReCaptchaEnterpriseProvider).not.toHaveBeenCalled();
		expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
		expect(
			(globalThis.self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean })
				.FIREBASE_APPCHECK_DEBUG_TOKEN
		).toBeUndefined();
	});

	it('initializes App Check before Firestore and Auth when a site key is configured', async () => {
		mocks.env.PUBLIC_FIREBASE_APPCHECK_SITE_KEY = 'site-key';
		const { getFirebase } = await import('./firebase');
		const firebase = await getFirebase();

		expect(firebase.appCheck).toBe(mocks.appCheck);
		expect(mocks.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
		expect(mocks.initializeAppCheck).toHaveBeenCalledWith(mocks.app, {
			provider: { siteKey: 'site-key' },
			isTokenAutoRefreshEnabled: true
		});
		expect(mocks.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.initializeFirestore.mock.invocationCallOrder[0]
		);
		expect(mocks.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.getAuth.mock.invocationCallOrder[0]
		);
	});

	it('sets App Check debug tokens only in dev builds', async () => {
		mocks.env.PUBLIC_FIREBASE_APPCHECK_SITE_KEY = 'site-key';
		mocks.env.PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN = 'debug-token';
		const { getFirebase } = await import('./firebase');
		await getFirebase();

		expect(
			(globalThis.self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean })
				.FIREBASE_APPCHECK_DEBUG_TOKEN
		).toBe('debug-token');

		vi.resetModules();
		vi.clearAllMocks();
		vi.stubEnv('DEV', false);
		delete (globalThis.self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean })
			.FIREBASE_APPCHECK_DEBUG_TOKEN;
		const { getFirebase: getFirebaseForProduction } = await import('./firebase');
		await getFirebaseForProduction();

		expect(
			(globalThis.self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean })
				.FIREBASE_APPCHECK_DEBUG_TOKEN
		).toBeUndefined();
	});

	it('generates a debug token in dev when no explicit token is configured', async () => {
		mocks.env.PUBLIC_FIREBASE_APPCHECK_SITE_KEY = 'site-key';
		const { getFirebase } = await import('./firebase');
		await getFirebase();

		expect(
			(globalThis.self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean })
				.FIREBASE_APPCHECK_DEBUG_TOKEN
		).toBe(true);
	});

	it('continues without App Check when initialization fails', async () => {
		mocks.env.PUBLIC_FIREBASE_APPCHECK_SITE_KEY = 'site-key';
		mocks.initializeAppCheck.mockImplementation(() => {
			throw new Error('blocked');
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const { getFirebase } = await import('./firebase');
		const firebase = await getFirebase();

		expect(firebase.appCheck).toBeUndefined();
		expect(firebase.db).toBe(mocks.persistentDb);
		expect(firebase.auth).toBe(mocks.auth);
		expect(warn).toHaveBeenCalledWith(
			'Firebase App Check could not be initialized; continuing without it.',
			expect.any(Error)
		);
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

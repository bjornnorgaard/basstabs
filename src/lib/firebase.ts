import type * as FirebaseApp from 'firebase/app';
import type * as FirebaseAppCheck from 'firebase/app-check';
import type * as FirebaseAuth from 'firebase/auth';
import type * as FirebaseFirestore from 'firebase/firestore';
import { env } from '$env/dynamic/public';

const firebaseConfig = {
	apiKey: 'AIzaSyD0fKYg55eOfxm-_f5Qcut0MqMQAqJgfwg',
	authDomain: 'basstabs-by-bear.firebaseapp.com',
	projectId: 'basstabs-by-bear',
	appId: '1:727729220569:web:c7fa66d97d19bea9da07c8'
};

export type FirebaseServices = {
	app: FirebaseApp.FirebaseApp;
	appCheck?: FirebaseAppCheck.AppCheck;
	auth: FirebaseAuth.Auth;
	db: FirebaseFirestore.Firestore;
	authSdk: typeof FirebaseAuth;
	firestoreSdk: typeof FirebaseFirestore;
	firestoreCache: 'persistent' | 'memory';
};

let firebase: FirebaseServices | undefined;
let firebasePromise: Promise<FirebaseServices> | undefined;

export function getCachedFirebase() {
	return firebase;
}

export function prewarmFirebase() {
	firebasePromise ??= loadFirebase();
	return firebasePromise;
}

export async function getFirebase() {
	return prewarmFirebase();
}

async function loadFirebase(): Promise<FirebaseServices> {
	try {
		const [appSdk, authSdk, firestoreSdk] = await Promise.all([
			import('firebase/app'),
			import('firebase/auth'),
			import('firebase/firestore')
		]);
		const app = appSdk.getApps()[0] ?? appSdk.initializeApp(firebaseConfig);
		const appCheck = await initializeAppCheck(app);
		const { db, cache } = initializeFirestore(app, firestoreSdk);
		firebase = {
			app,
			...(appCheck ? { appCheck } : {}),
			auth: authSdk.getAuth(app),
			db,
			authSdk,
			firestoreSdk,
			firestoreCache: cache
		};
		return firebase;
	} catch (error) {
		firebasePromise = undefined;
		throw error;
	}
}

async function initializeAppCheck(app: FirebaseApp.FirebaseApp) {
	const siteKey = env.PUBLIC_FIREBASE_APPCHECK_SITE_KEY?.trim();
	if (!siteKey) return undefined;

	try {
		if (import.meta.env.DEV) {
			const debugToken = env.PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN?.trim();
			const debugGlobal = (globalThis.self ?? globalThis) as typeof globalThis & {
				FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
			};
			debugGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
		}
		const appCheckSdk = await import('firebase/app-check');
		return appCheckSdk.initializeAppCheck(app, {
			provider: new appCheckSdk.ReCaptchaEnterpriseProvider(siteKey),
			isTokenAutoRefreshEnabled: true
		});
	} catch (error) {
		console.warn('Firebase App Check could not be initialized; continuing without it.', error);
		return undefined;
	}
}

function initializeFirestore(app: FirebaseApp.FirebaseApp, firestoreSdk: typeof FirebaseFirestore) {
	try {
		return {
			db: firestoreSdk.initializeFirestore(app, {
				localCache: firestoreSdk.persistentLocalCache({
					tabManager: firestoreSdk.persistentMultipleTabManager()
				})
			}),
			cache: 'persistent' as const
		};
	} catch {
		return { db: firestoreSdk.getFirestore(app), cache: 'memory' as const };
	}
}

export async function clearCachedFirestoreData() {
	const current = firebase;
	if (!current) return;
	await current.firestoreSdk.terminate(current.db);
	await current.firestoreSdk.clearIndexedDbPersistence(current.db);
	const { db, cache } = initializeFirestore(current.app, current.firestoreSdk);
	firebase = { ...current, db, firestoreCache: cache };
	firebasePromise = Promise.resolve(firebase);
}

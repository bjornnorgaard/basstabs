import type * as FirebaseApp from 'firebase/app';
import type * as FirebaseAuth from 'firebase/auth';
import type * as FirebaseFirestore from 'firebase/firestore';

const firebaseConfig = {
	apiKey: 'AIzaSyD0fKYg55eOfxm-_f5Qcut0MqMQAqJgfwg',
	authDomain: 'basstabs-by-bear.firebaseapp.com',
	projectId: 'basstabs-by-bear',
	appId: '1:727729220569:web:c7fa66d97d19bea9da07c8'
};

export type FirebaseServices = {
	app: FirebaseApp.FirebaseApp;
	auth: FirebaseAuth.Auth;
	db: FirebaseFirestore.Firestore;
	authSdk: typeof FirebaseAuth;
	firestoreSdk: typeof FirebaseFirestore;
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
		const app = appSdk.initializeApp(firebaseConfig);
		firebase = {
			app,
			auth: authSdk.getAuth(app),
			db: firestoreSdk.getFirestore(app),
			authSdk,
			firestoreSdk
		};
		return firebase;
	} catch (error) {
		firebasePromise = undefined;
		throw error;
	}
}

import { browser } from '$app/environment';
import type { User } from 'firebase/auth';
import type { Unsubscribe } from 'firebase/firestore';
import {
	clearCachedFirestoreData,
	getCachedFirebase,
	getFirebase,
	prewarmFirebase,
	type FirebaseServices
} from '$lib/firebase';
import { errorMessage } from './model';

const SESSION_HINT = 'basstabs:had-session';

function hasSessionHint() {
	if (!browser) return false;
	try {
		return localStorage.getItem(SESSION_HINT) === '1';
	} catch {
		return false;
	}
}

function setSessionHint(value: boolean) {
	if (!browser) return;
	try {
		if (value) localStorage.setItem(SESSION_HINT, '1');
		else localStorage.removeItem(SESSION_HINT);
	} catch {
		// Losing the hint only affects whether the next boot eagerly checks Auth.
	}
}

interface AuthSessionCallbacks {
	onUserChanged: (user: User | null, generation: number) => void;
	beforeSignOut: (generation: number) => Promise<void>;
	afterSignOut: () => void;
	setError: (message: string) => void;
}

export class CloudAuthSession {
	user = $state<User | null>(null);
	ready = $state(!hasSessionHint());
	busy = $state(false);
	generation = 0;
	private ensureTask?: Promise<FirebaseServices>;
	private authUnsubscribe?: Unsubscribe;

	constructor(private callbacks: AuthSessionCallbacks) {}

	startFromSessionHint() {
		if (hasSessionHint()) {
			void this.ensure();
		} else if (!this.user) {
			this.ready = true;
		}
	}

	skipInitialSessionCheck() {
		if (!this.user && !this.ensureTask) this.ready = true;
	}

	prewarmLogin() {
		void prewarmFirebase();
	}

	async ensure() {
		if (!browser) throw new Error('Cloud features are only available in the browser.');
		this.ensureTask ??= getFirebase()
			.then((firebase) => {
				this.watchAuth(firebase);
				return firebase;
			})
			.catch((error) => {
				this.ensureTask = undefined;
				this.callbacks.setError(errorMessage(error));
				this.ready = true;
				throw error;
			});
		return this.ensureTask;
	}

	watchAuth(firebase: FirebaseServices) {
		if (this.authUnsubscribe) return;
		this.authUnsubscribe = firebase.authSdk.onAuthStateChanged(
			firebase.auth,
			(user) => {
				if (user) setSessionHint(true);
				else setSessionHint(false);
				if (this.user?.uid === user?.uid && this.ready) return;
				this.generation += 1;
				this.user = user;
				this.ready = true;
				this.callbacks.onUserChanged(user, this.generation);
			},
			(error) => {
				this.callbacks.setError(errorMessage(error));
				this.ready = true;
			}
		);
	}

	async login() {
		this.busy = true;
		this.callbacks.setError('');
		try {
			const cached = getCachedFirebase();
			if (cached) this.watchAuth(cached);
			const firebase = cached ?? (await this.ensure());
			await firebase.authSdk.signInWithPopup(
				firebase.auth,
				new firebase.authSdk.GoogleAuthProvider()
			);
			setSessionHint(true);
		} catch (error) {
			this.callbacks.setError(errorMessage(error));
		} finally {
			this.busy = false;
		}
	}

	async logout() {
		this.busy = true;
		this.callbacks.setError('');
		const generation = this.generation;
		try {
			await this.callbacks.beforeSignOut(generation);
			const firebase = await this.ensure();
			await firebase.authSdk.signOut(firebase.auth);
			this.callbacks.afterSignOut();
			try {
				await clearCachedFirestoreData();
			} catch (error) {
				this.callbacks.setError(
					`Signed out, but this browser could not clear its cached cloud tabs: ${errorMessage(error)} Close other basstabs tabs, then sign in and out again before leaving a shared computer.`
				);
			}
			setSessionHint(false);
		} catch (error) {
			this.callbacks.setError(errorMessage(error));
		} finally {
			this.busy = false;
		}
	}
}

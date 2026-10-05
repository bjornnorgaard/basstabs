import type { User } from 'firebase/auth';
import type { Unsubscribe } from 'firebase/firestore';
import { SvelteMap } from 'svelte/reactivity';
import { getCachedFirebase, type FirebaseServices } from '$lib/firebase';
import { cloudData, cloudTitleKey, errorMessage, readCloudTab, type CloudTab } from './model';

interface CloudLibraryHost {
	ensure: () => Promise<FirebaseServices>;
	getGeneration: () => number;
	getDirty: () => string[];
	getSaving: () => string[];
	setError: (message: string) => void;
}

export class CloudLibraryListener {
	loading = $state(false);
	connectionFailed = $state(false);
	offline = $state(false);
	pendingSync = $state(false);
	tabs = $state<CloudTab[]>([]);
	private unsubscribe?: Unsubscribe;
	private savedShareIds = new SvelteMap<string, string | null>();
	private savedTitleKeys = new SvelteMap<string, string>();

	constructor(private host: CloudLibraryHost) {}

	connect(user: User) {
		this.disconnect();
		this.loading = true;
		if (this.connectionFailed) this.host.setError('');
		this.connectionFailed = false;
		const generation = this.host.getGeneration();
		const firebase = getCachedFirebase();
		if (firebase) {
			this.subscribeToTabs(firebase, user, generation);
			return;
		}
		void this.host
			.ensure()
			.then((firebase) => {
				if (this.host.getGeneration() === generation)
					this.subscribeToTabs(firebase, user, generation);
			})
			.catch((error) => {
				if (this.host.getGeneration() !== generation) return;
				this.host.setError(errorMessage(error));
				this.connectionFailed = true;
				this.loading = false;
			});
	}

	disconnect() {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
	}

	reset() {
		this.disconnect();
		this.savedShareIds.clear();
		this.savedTitleKeys.clear();
		this.tabs = [];
		this.loading = false;
		this.connectionFailed = false;
		this.offline = false;
		this.pendingSync = false;
	}

	clearUploadAttemptsState() {
		this.connectionFailed = false;
	}

	cacheDrafts(user: User | null) {
		if (!user) return;
		try {
			const key = `basstabs:cloud-drafts:${user.uid}`;
			const dirty = this.host.getDirty();
			const drafts = this.tabs
				.filter((tab) => dirty.includes(tab.id))
				.map((tab) => ({
					...cloudData(tab),
					id: tab.id,
					oldShareId: this.savedShareIds.get(tab.id) ?? null
				}));
			if (drafts.length) localStorage.setItem(key, JSON.stringify(drafts));
			else localStorage.removeItem(key);
			return true;
		} catch (error) {
			this.host.setError(
				`Could not back up unsaved cloud drafts in this browser: ${errorMessage(error)}`
			);
			return false;
		}
	}

	restoreDrafts(uid: string) {
		try {
			const raw = localStorage.getItem(`basstabs:cloud-drafts:${uid}`);
			if (!raw) return;
			const drafts: unknown = JSON.parse(raw);
			if (!Array.isArray(drafts)) throw new Error('Invalid draft cache.');
			const restored = drafts.map((draft: unknown) => {
				if (
					!draft ||
					typeof draft !== 'object' ||
					!('id' in draft) ||
					typeof draft.id !== 'string'
				) {
					throw new Error('Invalid draft cache entry.');
				}
				const data = { ...draft };
				if (
					!('oldShareId' in data) ||
					(data.oldShareId !== null &&
						(typeof data.oldShareId !== 'string' || !/^[a-f0-9]{32}$/.test(data.oldShareId)))
				) {
					throw new Error('Invalid draft sharing state.');
				}
				this.savedShareIds.set(draft.id, data.oldShareId);
				return readCloudTab(draft.id, data);
			});
			this.tabs = restored;
			return restored.map((tab) => tab.id);
		} catch (error) {
			this.host.setError(`Could not restore cloud drafts: ${errorMessage(error)}`);
			return;
		}
	}

	getSavedShareId(id: string) {
		return this.savedShareIds.get(id);
	}

	hasSavedShareId(id: string) {
		return this.savedShareIds.has(id);
	}

	setSavedShareId(id: string, shareId: string | null) {
		this.savedShareIds.set(id, shareId);
	}

	deleteSavedShareId(id: string) {
		this.savedShareIds.delete(id);
	}

	getSavedTitleKey(id: string) {
		return this.savedTitleKeys.get(id);
	}

	hasSavedTitleKey(id: string) {
		return this.savedTitleKeys.has(id);
	}

	setSavedTitleKey(id: string, titleKey: string) {
		this.savedTitleKeys.set(id, titleKey);
	}

	deleteSavedTitleKey(id: string) {
		this.savedTitleKeys.delete(id);
	}

	private subscribeToTabs(firebase: FirebaseServices, user: User, generation: number) {
		const { db, firestoreSdk } = firebase;
		this.unsubscribe = firestoreSdk.onSnapshot(
			firestoreSdk.collection(db, 'users', user.uid, 'tabs'),
			{ includeMetadataChanges: true },
			(snapshot) => {
				if (this.host.getGeneration() !== generation) return;
				try {
					const remote = snapshot.docs.map((d) => readCloudTab(d.id, d.data()));
					for (const tab of remote) {
						if (!this.host.getSaving().includes(tab.id)) {
							this.savedShareIds.set(tab.id, tab.shareId);
							this.savedTitleKeys.set(tab.id, cloudTitleKey(tab.title));
						}
					}
					const dirty = this.host.getDirty();
					const drafts = this.tabs.filter((t) => dirty.includes(t.id));
					this.tabs = [...remote.filter((t) => !dirty.includes(t.id)), ...drafts];
					this.offline = snapshot.metadata.fromCache;
					this.pendingSync = snapshot.metadata.hasPendingWrites;
					this.loading = false;
				} catch (error) {
					this.host.setError(errorMessage(error));
					this.connectionFailed = true;
					this.loading = false;
				}
			},
			(error) => {
				if (this.host.getGeneration() !== generation) return;
				this.host.setError(
					error.code === 'permission-denied'
						? 'Google sign-in succeeded, but Firestore denied access to your cloud tabs. Publish the app-specific Firestore rules to the (default) database in Firebase project basstabs-by-bear, then choose Reconnect cloud. Do not enable blanket public access.'
						: errorMessage(error)
				);
				this.connectionFailed = true;
				this.loading = false;
			}
		);
	}
}

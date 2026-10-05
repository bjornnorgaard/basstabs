import { browser } from '$app/environment';
import { untrack } from 'svelte';
import type { User } from 'firebase/auth';
import type { Unsubscribe } from 'firebase/firestore';
import {
	clearCachedFirestoreData,
	getCachedFirebase,
	getFirebase,
	prewarmFirebase,
	type FirebaseServices
} from '$lib/firebase';
import {
	cloudData,
	cloudTitleConflict,
	cloudTitleKey,
	errorMessage,
	readCloudTab,
	shareToken,
	type CloudTab,
	type Visibility
} from '$lib/cloud/model';
import { queueCloudTabWrite, writeCloudTab } from '$lib/cloud/write';
import { tabStore, type BassTab } from './tabs.svelte';

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

class CloudStore {
	user = $state<User | null>(null);
	ready = $state(!hasSessionHint());
	loading = $state(false);
	connectionFailed = $state(false);
	offline = $state(false);
	pendingSync = $state(false);
	busy = $state(false);
	error = $state('');
	tabs = $state<CloudTab[]>([]);
	dirty = $state<string[]>([]);
	saving = $state<string[]>([]);
	movingToBrowser = $state<string[]>([]);
	uploadErrors = $state<Record<string, string>>({});
	private unsubscribe?: Unsubscribe;
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private writes = new Map<string, Promise<void>>();
	private revisions = new Map<string, number>();
	private savedShareIds = new Map<string, string | null>();
	private savedTitleKeys = new Map<string, string>();
	private generation = 0;
	private uploadAttempts = new Map<string, string>();
	private syncTask?: { generation: number; promise: Promise<void> };
	private ensureTask?: Promise<FirebaseServices>;
	private authUnsubscribe?: Unsubscribe;
	sorted = $derived([...this.tabs].sort((a, b) => b.updatedAt - a.updatedAt));

	constructor() {
		if (!browser) return;
		window.addEventListener('beforeunload', (event) => {
			if (this.dirty.length || this.saving.length || this.movingToBrowser.length) {
				event.preventDefault();
				event.returnValue = '';
			}
		});
		window.addEventListener('online', () => {
			if (!this.user) return;
			if (this.connectionFailed) this.connect();
			void this.syncBrowserTabs();
			this.retryDirtySaves();
		});
		$effect.root(() => {
			$effect(() => {
				const eligible = !!this.user && !this.loading && !this.connectionFailed && !this.busy;
				JSON.stringify(tabStore.tabs);
				if (!eligible) return;
				const timer = setTimeout(() => {
					untrack(() => {
						void this.syncBrowserTabs();
					});
				}, 800);
				return () => clearTimeout(timer);
			});
		});
	}

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
				this.error = errorMessage(error);
				this.ready = true;
				throw error;
			});
		return this.ensureTask;
	}

	private watchAuth(firebase: FirebaseServices) {
		if (this.authUnsubscribe) return;
		this.authUnsubscribe = firebase.authSdk.onAuthStateChanged(
			firebase.auth,
			(user) => {
				if (user) setSessionHint(true);
				else setSessionHint(false);
				if (this.user?.uid === user?.uid && this.ready) return;
				if (this.dirty.length) {
					this.error =
						'Your account changed before cloud edits were saved. Sign back into the previous account to restore drafts if the browser backup succeeded.';
				}
				this.generation += 1;
				this.unsubscribe?.();
				for (const timer of this.timers.values()) clearTimeout(timer);
				this.timers.clear();
				this.revisions.clear();
				this.savedShareIds.clear();
				this.savedTitleKeys.clear();
				this.tabs = [];
				this.dirty = [];
				this.saving = [];
				this.movingToBrowser = [];
				this.uploadErrors = {};
				this.uploadAttempts.clear();
				this.user = user;
				this.ready = true;
				this.loading = !!user;
				this.connectionFailed = false;
				this.offline = false;
				this.pendingSync = false;
				if (!user) return;
				this.restoreDrafts(user.uid);
				void this.connect();
			},
			(error) => {
				this.error = errorMessage(error);
				this.ready = true;
			}
		);
	}

	connect() {
		const user = this.user;
		if (!user) return;
		this.unsubscribe?.();
		this.loading = true;
		if (this.connectionFailed) this.error = '';
		this.connectionFailed = false;
		this.uploadAttempts.clear();
		const generation = this.generation;
		const firebase = getCachedFirebase();
		if (firebase) {
			this.subscribeToTabs(firebase, user, generation);
			return;
		}
		void this.ensure()
			.then((firebase) => {
				if (this.generation === generation) this.subscribeToTabs(firebase, user, generation);
			})
			.catch((error) => {
				if (this.generation !== generation) return;
				this.error = errorMessage(error);
				this.connectionFailed = true;
				this.loading = false;
			});
	}

	private subscribeToTabs(firebase: FirebaseServices, user: User, generation: number) {
		const { db, firestoreSdk } = firebase;
		this.unsubscribe = firestoreSdk.onSnapshot(
			firestoreSdk.collection(db, 'users', user.uid, 'tabs'),
			{ includeMetadataChanges: true },
			(snapshot) => {
				if (this.generation !== generation) return;
				try {
					const remote = snapshot.docs.map((d) => readCloudTab(d.id, d.data()));
					for (const tab of remote) {
						if (!this.saving.includes(tab.id)) {
							this.savedShareIds.set(tab.id, tab.shareId);
							this.savedTitleKeys.set(tab.id, cloudTitleKey(tab.title));
						}
					}
					const drafts = this.tabs.filter((t) => this.dirty.includes(t.id));
					this.tabs = [...remote.filter((t) => !this.dirty.includes(t.id)), ...drafts];
					this.offline = snapshot.metadata.fromCache;
					this.pendingSync = snapshot.metadata.hasPendingWrites;
					this.loading = false;
				} catch (error) {
					this.error = errorMessage(error);
					this.connectionFailed = true;
					this.loading = false;
				}
			},
			(error) => {
				if (this.generation !== generation) return;
				this.error =
					error.code === 'permission-denied'
						? 'Google sign-in succeeded, but Firestore denied access to your cloud tabs. Publish the app-specific Firestore rules to the (default) database in Firebase project basstabs-by-bear, then choose Reconnect cloud. Do not enable blanket public access.'
						: errorMessage(error);
				this.connectionFailed = true;
				this.loading = false;
			}
		);
	}

	private cacheDrafts() {
		if (!this.user) return;
		try {
			const key = `basstabs:cloud-drafts:${this.user.uid}`;
			const drafts = this.tabs
				.filter((tab) => this.dirty.includes(tab.id))
				.map((tab) => ({
					...cloudData(tab),
					id: tab.id,
					oldShareId: this.savedShareIds.get(tab.id) ?? null
				}));
			if (drafts.length) localStorage.setItem(key, JSON.stringify(drafts));
			else localStorage.removeItem(key);
			return true;
		} catch (error) {
			this.error = `Could not back up unsaved cloud drafts in this browser: ${errorMessage(error)}`;
			return false;
		}
	}

	private restoreDrafts(uid: string) {
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
			this.dirty = restored.map((tab) => tab.id);
		} catch (error) {
			this.error = `Could not restore cloud drafts: ${errorMessage(error)}`;
		}
	}

	get(id: string) {
		return this.tabs.find((t) => t.id === id);
	}

	create(init: Partial<Omit<BassTab, 'id' | 'createdAt' | 'updatedAt'>> = {}) {
		let title = init.title ?? 'Untitled tab';
		if (this.user) {
			const base = title;
			let suffix = 2;
			const titles = [...this.tabs, ...tabStore.tabs].map((tab) => cloudTitleKey(tab.title));
			while (titles.includes(cloudTitleKey(title))) title = `${base} (${suffix++})`;
		}
		return tabStore.create({
			...init,
			title,
			...(this.user && !init.browserOnly ? { cloudOwnerId: this.user.uid } : {})
		});
	}

	async syncBrowserTabs(allowBusy = false): Promise<void> {
		const user = this.user;
		const generation = this.generation;
		if (!user || this.loading || this.connectionFailed || (this.busy && !allowBusy)) return;
		if (this.syncTask?.generation === generation) {
			await this.syncTask.promise;
			if (this.generation === generation) return this.syncBrowserTabs(allowBusy);
			return;
		}
		const operation = this.promoteBrowserTabs(user, generation, allowBusy);
		this.syncTask = { generation, promise: operation };
		try {
			await operation;
		} finally {
			if (this.syncTask?.promise === operation) this.syncTask = undefined;
		}
	}

	private async promoteBrowserTabs(user: User, generation: number, allowBusy: boolean) {
		for (const candidate of [...tabStore.tabs]) {
			if (this.generation !== generation || this.connectionFailed || (this.busy && !allowBusy))
				break;
			const local = tabStore.get(candidate.id);
			if (
				!local ||
				local.browserOnly ||
				this.get(local.id) ||
				this.writes.has(local.id) ||
				(local.cloudOwnerId && local.cloudOwnerId !== user.uid)
			)
				continue;
			const fingerprint = JSON.stringify(local);
			if (this.uploadAttempts.get(local.id) === fingerprint) continue;
			this.uploadAttempts.set(local.id, fingerprint);
			try {
				await this.upload(local);
				if (this.generation === generation) delete this.uploadErrors[local.id];
			} catch (error) {
				if (this.generation !== generation) break;
				const message = errorMessage(error);
				this.uploadErrors[local.id] = message;
				this.error = `Could not automatically save "${local.title}" to the cloud: ${message} Your browser version was kept.`;
				const latest = tabStore.get(local.id);
				if (latest) this.uploadAttempts.set(local.id, JSON.stringify(latest));
			}
		}
	}

	async keepBrowserOnly(id: string) {
		if (this.writes.has(id))
			throw new Error('Wait for the current cloud operation to finish, then try again.');
		const cloud = this.get(id);
		if (!cloud) {
			const local = tabStore.get(id);
			if (!local) throw new Error('This tab could not be found.');
			tabStore.keepBrowserOnly(local);
			delete this.uploadErrors[id];
			return;
		}
		const generation = this.generation;
		this.movingToBrowser.push(id);
		try {
			tabStore.keepBrowserOnly(cloud);
			await this.remove(id, true);
			if (this.generation !== generation)
				throw new Error(
					'Your account changed. The browser version was kept; sign back in to check cloud removal.'
				);
			delete this.uploadErrors[id];
		} catch (error) {
			throw new Error(
				`Could not finish moving this tab to browser-only storage: ${errorMessage(error)} Check the cloud version before retrying.`,
				{ cause: error }
			);
		} finally {
			if (this.generation === generation)
				this.movingToBrowser = this.movingToBrowser.filter((key) => key !== id);
		}
	}

	async login() {
		this.busy = true;
		this.error = '';
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
			this.error = errorMessage(error);
		} finally {
			this.busy = false;
		}
	}

	async logout() {
		this.busy = true;
		this.error = '';
		const generation = this.generation;
		try {
			await this.syncBrowserTabs(true);
			await Promise.all(this.writes.values());
			await Promise.all(this.dirty.map((id) => this.save(id)));
			if (
				this.dirty.length ||
				tabStore.tabs.some(
					(tab) =>
						!tab.browserOnly &&
						(!tab.cloudOwnerId || tab.cloudOwnerId === this.user?.uid) &&
						this.uploadErrors[tab.id]
				)
			)
				throw new Error(
					'Save your remaining cloud changes, or choose Browser only under Save location, before signing out.'
				);
			if (this.generation !== generation)
				throw new Error(
					'Your account changed while saving. Check the current account before signing out.'
				);
			const firebase = await this.ensure();
			await firebase.authSdk.signOut(firebase.auth);
			this.unsubscribe?.();
			this.unsubscribe = undefined;
			try {
				await clearCachedFirestoreData();
			} catch (error) {
				this.error = `Signed out, but this browser could not clear its cached cloud tabs: ${errorMessage(error)} Close other basstabs tabs, then sign in and out again before leaving a shared computer.`;
			}
			setSessionHint(false);
		} catch (error) {
			this.error = errorMessage(error);
		} finally {
			this.busy = false;
		}
	}

	update(id: string, changes: Partial<Pick<BassTab, 'title' | 'artist' | 'tuningId' | 'source'>>) {
		const tab = this.get(id);
		if (!tab || !this.user) throw new Error('Sign in to edit this cloud tab.');
		if (!this.savedTitleKeys.has(id) && !this.dirty.includes(id))
			this.savedTitleKeys.set(id, cloudTitleKey(tab.title));
		if (this.movingToBrowser.includes(id)) {
			tabStore.keepBrowserOnly({
				...tab,
				...changes,
				updatedAt: Math.max(Date.now(), tab.updatedAt)
			});
		}
		Object.assign(tab, changes, { updatedAt: Math.max(Date.now(), tab.updatedAt) });
		this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
		if (!this.dirty.includes(id)) this.dirty.push(id);
		const backedUp = this.cacheDrafts();
		clearTimeout(this.timers.get(id));
		if (this.movingToBrowser.includes(id)) return backedUp;
		this.timers.set(
			id,
			setTimeout(() => {
				void this.save(id).catch((error) => {
					if (isOfflineError(error)) this.noteOfflineRetry();
					else this.error = errorMessage(error);
				});
			}, 800)
		);
		return backedUp;
	}

	async upload(local: BassTab): Promise<string> {
		const user = this.user;
		if (!user) throw new Error('Sign in to save tabs to the cloud.');
		const firebase = this.ensure();
		if (this.writes.has(local.id))
			throw new Error('This tab already has a cloud save in progress.');
		const conflict = cloudTitleConflict(local.title, this.tabs);
		if (conflict) throw new Error(conflict);
		if (local.cloudOwnerId && local.cloudOwnerId !== user.uid) {
			throw new Error(
				'This pending cloud save belongs to another account. Sign into that account, or choose Browser only under Save location first.'
			);
		}
		if (tabStore.get(local.id)) {
			tabStore.put({ ...local, browserOnly: false, cloudOwnerId: user.uid });
		}
		const generation = this.generation;
		const tab: CloudTab = {
			...local,
			visibility: 'private',
			shareId: null
		};
		this.saving.push(tab.id);
		const operation = firebase.then(({ db, firestoreSdk }) =>
			writeCloudTab(db, tab, user.uid, null, true, firestoreSdk)
		);
		this.writes.set(tab.id, operation);
		try {
			await operation;
			if (this.generation !== generation) {
				throw new Error(
					'Saved to the previous account. Your browser tab was kept; sign back in to continue.'
				);
			}
			if (!this.get(tab.id)) this.tabs.push(tab);
			this.savedShareIds.set(tab.id, null);
			this.savedTitleKeys.set(tab.id, cloudTitleKey(tab.title));
			this.finishPromotion(local.id, tab);
			delete this.uploadErrors[local.id];
			return tab.id;
		} finally {
			if (this.writes.get(tab.id) === operation) this.writes.delete(tab.id);
			if (this.generation === generation) this.saving = this.saving.filter((id) => id !== tab.id);
		}
	}

	async replaceFromLocal(local: BassTab, id: string): Promise<string> {
		if (!this.get(id) || !this.user)
			throw new Error('Sign in and load the existing cloud tab first.');
		if (local.cloudOwnerId && local.cloudOwnerId !== this.user.uid) {
			throw new Error(
				'This pending save belongs to another account. Choose Browser only under Save location before moving it to this account.'
			);
		}
		const generation = this.generation;
		const snapshot = { ...local };
		const { title, artist, tuningId, source } = snapshot;
		this.update(id, { title, artist, tuningId, source });
		await this.save(id);
		if (this.generation !== generation) {
			throw new Error(
				'Saved to the previous account. Your browser tab was kept; sign back in to continue.'
			);
		}
		this.finishPromotion(local.id, snapshot, id);
		return id;
	}

	private finishPromotion(localId: string, snapshot: BassTab, cloudId = snapshot.id) {
		const latest = tabStore.get(localId);
		if (
			latest &&
			(['title', 'artist', 'tuningId', 'source'] as const).some(
				(key) => latest[key] !== snapshot[key]
			)
		) {
			const { title, artist, tuningId, source } = latest;
			if (!this.update(cloudId, { title, artist, tuningId, source })) {
				throw new Error(
					'Cloud saving was enabled, but newer edits could not be backed up. Your browser tab was kept.'
				);
			}
		}
		tabStore.remove(localId);
	}

	async save(id: string, oldShareId?: string | null): Promise<void> {
		if (this.movingToBrowser.includes(id))
			throw new Error('This tab is being moved to browser-only storage.');
		const previous = this.writes.get(id);
		if (previous) {
			await previous;
			if (this.dirty.includes(id)) return this.save(id, oldShareId);
			return;
		}
		const tab = this.get(id);
		const user = this.user;
		if (!tab || !user) throw new Error('Sign in to save this cloud tab.');
		const firebase = this.ensure();
		clearTimeout(this.timers.get(id));
		const revision = this.revisions.get(id) ?? 0;
		const generation = this.generation;
		const snapshot = { ...tab };
		this.saving.push(id);
		const resolvedOldShareId =
			oldShareId === undefined ? (this.savedShareIds.get(id) ?? snapshot.shareId) : oldShareId;
		const needsServerTitleCheck = this.savedTitleKeys.get(id) !== cloudTitleKey(snapshot.title);
		const operation = firebase.then(({ db, firestoreSdk }) =>
			needsServerTitleCheck
				? writeCloudTab(db, snapshot, user.uid, resolvedOldShareId, false, firestoreSdk)
				: queueCloudTabWrite(db, snapshot, user.uid, resolvedOldShareId, firestoreSdk)
		);
		this.writes.set(id, operation);
		try {
			await operation;
			if (this.generation === generation) {
				this.savedShareIds.set(id, snapshot.shareId);
				this.savedTitleKeys.set(id, cloudTitleKey(snapshot.title));
				if (revision === (this.revisions.get(id) ?? 0)) {
					this.dirty = this.dirty.filter((key) => key !== id);
				}
				this.cacheDrafts();
			}
		} catch (error) {
			if (needsServerTitleCheck && isOfflineError(error) && this.generation === generation) {
				this.noteOfflineRetry();
			}
			throw error;
		} finally {
			if (this.writes.get(id) === operation) this.writes.delete(id);
			if (this.generation === generation) this.saving = this.saving.filter((key) => key !== id);
		}
	}

	async setVisibility(id: string, visibility: Visibility) {
		await this.save(id);
		const tab = this.get(id);
		const user = this.user;
		if (!tab || !user) throw new Error('Sign in to change sharing.');
		const generation = this.generation;
		const oldVisibility = tab.visibility;
		const oldShareId = tab.shareId;
		Object.assign(tab, {
			visibility,
			shareId: visibility === 'private' ? null : (tab.shareId ?? shareToken()),
			updatedAt: Math.max(Date.now(), tab.updatedAt)
		});
		this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
		if (!this.dirty.includes(id)) this.dirty.push(id);
		this.cacheDrafts();
		try {
			await this.save(id, oldShareId);
		} catch (error) {
			if (this.generation === generation) {
				const current = this.get(id);
				if (current) Object.assign(current, { visibility: oldVisibility, shareId: oldShareId });
				this.cacheDrafts();
			}
			throw error;
		}
	}

	async remove(id: string, keepBrowserBackup = false) {
		const previous = this.writes.get(id);
		if (previous) await previous;
		const tab = this.get(id);
		const user = this.user;
		if (!tab || !user) throw new Error('Sign in to delete this cloud tab.');
		const { db, firestoreSdk } = await this.ensure();
		const generation = this.generation;
		const batch = firestoreSdk.writeBatch(db);
		batch.delete(firestoreSdk.doc(db, 'users', user.uid, 'tabs', id));
		const shareId = this.savedShareIds.has(id) ? this.savedShareIds.get(id) : tab.shareId;
		if (shareId) batch.delete(firestoreSdk.doc(db, 'publishedTabs', shareId));
		clearTimeout(this.timers.get(id));
		const operation = batch.commit();
		this.writes.set(id, operation);
		try {
			await operation;
			if (this.generation === generation) {
				if (!keepBrowserBackup && tabStore.get(id)) tabStore.remove(id);
				this.tabs = this.tabs.filter((t) => t.id !== id);
				this.dirty = this.dirty.filter((key) => key !== id);
				this.savedShareIds.delete(id);
				this.savedTitleKeys.delete(id);
				this.cacheDrafts();
			}
		} finally {
			if (this.writes.get(id) === operation) this.writes.delete(id);
		}
	}

	private retryDirtySaves() {
		for (const id of this.dirty) {
			if (this.writes.has(id) || this.saving.includes(id)) continue;
			void this.save(id).catch((error) => {
				if (isOfflineError(error)) this.noteOfflineRetry();
				else this.error = errorMessage(error);
			});
		}
	}

	private noteOfflineRetry() {
		this.offline = true;
		this.pendingSync = true;
		this.error =
			'You appear to be offline. Cached cloud tabs remain editable; changes that need the server will retry when the connection returns.';
	}
}

export const cloudStore = new CloudStore();

function isOfflineError(error: unknown) {
	const candidate = error as { code?: unknown; message?: unknown };
	return (
		candidate.code === 'unavailable' ||
		(typeof candidate.message === 'string' && /\boffline\b/i.test(candidate.message))
	);
}

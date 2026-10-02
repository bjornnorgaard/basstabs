import { browser } from '$app/environment';
import {
	GoogleAuthProvider,
	onAuthStateChanged,
	signInWithPopup,
	signOut,
	type User
} from 'firebase/auth';
import { collection, doc, onSnapshot, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '$lib/firebase';
import {
	cloudData,
	errorMessage,
	readCloudTab,
	shareToken,
	type CloudTab,
	type Visibility
} from '$lib/cloud/model';
import type { BassTab } from './tabs.svelte';

class CloudStore {
	user = $state<User | null>(null);
	ready = $state(false);
	loading = $state(false);
	connectionFailed = $state(false);
	busy = $state(false);
	error = $state('');
	tabs = $state<CloudTab[]>([]);
	dirty = $state<string[]>([]);
	saving = $state<string[]>([]);
	private unsubscribe?: Unsubscribe;
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private writes = new Map<string, Promise<void>>();
	private revisions = new Map<string, number>();
	private savedShareIds = new Map<string, string | null>();
	private generation = 0;
	sorted = $derived([...this.tabs].sort((a, b) => b.updatedAt - a.updatedAt));

	constructor() {
		if (!browser) return;
		onAuthStateChanged(
			auth,
			(user) => {
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
				this.tabs = [];
				this.dirty = [];
				this.saving = [];
				this.user = user;
				this.ready = true;
				this.loading = !!user;
				this.connectionFailed = false;
				if (!user) return;
				this.restoreDrafts(user.uid);
				this.connect();
			},
			(error) => {
				this.error = errorMessage(error);
				this.ready = true;
			}
		);
		window.addEventListener('beforeunload', (event) => {
			if (this.dirty.length) {
				event.preventDefault();
				event.returnValue = '';
			}
		});
	}

	connect() {
		const user = this.user;
		if (!user) return;
		this.unsubscribe?.();
		this.loading = true;
		if (this.connectionFailed) this.error = '';
		this.connectionFailed = false;
		const generation = this.generation;
		this.unsubscribe = onSnapshot(
			collection(db, 'users', user.uid, 'tabs'),
			(snapshot) => {
				if (this.generation !== generation) return;
				try {
					const remote = snapshot.docs.map((d) => readCloudTab(d.id, d.data()));
					for (const tab of remote) {
						if (!this.saving.includes(tab.id)) this.savedShareIds.set(tab.id, tab.shareId);
					}
					const drafts = this.tabs.filter((t) => this.dirty.includes(t.id));
					this.tabs = [...remote.filter((t) => !this.dirty.includes(t.id)), ...drafts];
					this.loading = false;
				} catch (error) {
					this.error = errorMessage(error);
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
		} catch (error) {
			this.error = `Could not back up unsaved cloud drafts in this browser: ${errorMessage(error)}`;
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

	async login() {
		this.busy = true;
		this.error = '';
		try {
			await signInWithPopup(auth, new GoogleAuthProvider());
		} catch (error) {
			this.error = errorMessage(error);
		} finally {
			this.busy = false;
		}
	}

	async logout() {
		this.busy = true;
		this.error = '';
		try {
			await Promise.all(this.dirty.map((id) => this.save(id)));
			if (this.dirty.length)
				throw new Error('Save your remaining cloud changes before signing out.');
			await signOut(auth);
		} catch (error) {
			this.error = errorMessage(error);
		} finally {
			this.busy = false;
		}
	}

	update(id: string, changes: Partial<Pick<BassTab, 'title' | 'artist' | 'tuningId' | 'source'>>) {
		const tab = this.get(id);
		if (!tab || !this.user) throw new Error('Sign in to edit this cloud tab.');
		Object.assign(tab, changes, { updatedAt: Math.max(Date.now(), tab.updatedAt) });
		this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
		if (!this.dirty.includes(id)) this.dirty.push(id);
		this.cacheDrafts();
		clearTimeout(this.timers.get(id));
		this.timers.set(
			id,
			setTimeout(() => {
				void this.save(id).catch((error) => {
					this.error = errorMessage(error);
				});
			}, 800)
		);
	}

	private async write(tab: CloudTab, uid: string, oldShareId: string | null) {
		readCloudTab(tab.id, cloudData(tab));
		const batch = writeBatch(db);
		batch.set(doc(db, 'users', uid, 'tabs', tab.id), cloudData(tab));
		if (oldShareId && oldShareId !== tab.shareId)
			batch.delete(doc(db, 'publishedTabs', oldShareId));
		const { shareId, ...data } = cloudData(tab);
		if (shareId) {
			batch.set(doc(db, 'publishedTabs', shareId), { ...data, ownerId: uid, tabId: tab.id });
		}
		await batch.commit();
	}

	async upload(local: BassTab): Promise<string> {
		const user = this.user;
		if (!user) throw new Error('Sign in to save tabs to the cloud.');
		const generation = this.generation;
		const tab: CloudTab = {
			...local,
			id: crypto.randomUUID(),
			visibility: 'private',
			shareId: null
		};
		await this.write(tab, user.uid, null);
		if (this.generation === generation && !this.get(tab.id)) {
			this.tabs.push(tab);
			this.savedShareIds.set(tab.id, null);
		}
		return tab.id;
	}

	async save(id: string, oldShareId?: string | null): Promise<void> {
		const previous = this.writes.get(id);
		if (previous) {
			await previous;
			if (this.dirty.includes(id)) return this.save(id, oldShareId);
			return;
		}
		const tab = this.get(id);
		const user = this.user;
		if (!tab || !user) throw new Error('Sign in to save this cloud tab.');
		clearTimeout(this.timers.get(id));
		const revision = this.revisions.get(id) ?? 0;
		const generation = this.generation;
		const snapshot = { ...tab };
		this.saving.push(id);
		const operation = this.write(
			snapshot,
			user.uid,
			oldShareId === undefined ? (this.savedShareIds.get(id) ?? snapshot.shareId) : oldShareId
		);
		this.writes.set(id, operation);
		try {
			await operation;
			if (this.generation === generation) {
				this.savedShareIds.set(id, snapshot.shareId);
				if (revision === (this.revisions.get(id) ?? 0)) {
					this.dirty = this.dirty.filter((key) => key !== id);
				}
				this.cacheDrafts();
			}
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

	async remove(id: string) {
		const previous = this.writes.get(id);
		if (previous) await previous;
		const tab = this.get(id);
		const user = this.user;
		if (!tab || !user) throw new Error('Sign in to delete this cloud tab.');
		const generation = this.generation;
		const batch = writeBatch(db);
		batch.delete(doc(db, 'users', user.uid, 'tabs', id));
		const shareId = this.savedShareIds.has(id) ? this.savedShareIds.get(id) : tab.shareId;
		if (shareId) batch.delete(doc(db, 'publishedTabs', shareId));
		clearTimeout(this.timers.get(id));
		const operation = batch.commit();
		this.writes.set(id, operation);
		try {
			await operation;
			if (this.generation === generation) {
				this.tabs = this.tabs.filter((t) => t.id !== id);
				this.dirty = this.dirty.filter((key) => key !== id);
				this.savedShareIds.delete(id);
				this.cacheDrafts();
			}
		} finally {
			if (this.writes.get(id) === operation) this.writes.delete(id);
		}
	}
}

export const cloudStore = new CloudStore();

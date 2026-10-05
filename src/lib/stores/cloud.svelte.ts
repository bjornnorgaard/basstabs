import { browser } from '$app/environment';
import { untrack } from 'svelte';
import type { User } from 'firebase/auth';
import { type FirebaseServices } from '$lib/firebase';
import { CloudAuthSession } from '$lib/cloud/auth-session.svelte';
import { isOfflineError } from '$lib/cloud/errors';
import { CloudLibraryListener } from '$lib/cloud/library-listener.svelte';
import {
	cloudTitleKey,
	errorMessage,
	shareToken,
	type CloudTab,
	type Visibility
} from '$lib/cloud/model';
import { CloudUploadQueue } from '$lib/cloud/upload-queue.svelte';
import { queueCloudTabWrite, writeCloudTab } from '$lib/cloud/write';
import { tabStore, type BassTab } from './tabs.svelte';

class CloudStore {
	private auth: CloudAuthSession;
	private library: CloudLibraryListener;
	private uploads: CloudUploadQueue;
	error = $state('');
	dirty = $state<string[]>([]);
	saving = $state<string[]>([]);
	movingToBrowser = $state<string[]>([]);
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private writes = new Map<string, Promise<void>>();
	private revisions = new Map<string, number>();
	sorted = $derived([...this.tabs].sort((a, b) => b.updatedAt - a.updatedAt));

	constructor() {
		this.auth = new CloudAuthSession({
			onUserChanged: (user) => this.handleUserChanged(user),
			beforeSignOut: (generation) => this.prepareSignOut(generation),
			afterSignOut: () => this.library.disconnect(),
			setError: (message) => (this.error = message)
		});
		this.library = new CloudLibraryListener({
			ensure: () => this.ensure(),
			getGeneration: () => this.generation,
			getDirty: () => this.dirty,
			getSaving: () => this.saving,
			setError: (message) => (this.error = message)
		});
		this.uploads = new CloudUploadQueue({
			ensure: () => this.ensure(),
			getUser: () => this.user,
			getGeneration: () => this.generation,
			getLoading: () => this.loading,
			getConnectionFailed: () => this.connectionFailed,
			getBusy: () => this.busy,
			getTabs: () => this.tabs,
			setTabs: (tabs) => (this.tabs = tabs),
			getWrites: () => this.writes,
			get: (id) => this.get(id),
			addSaving: (id) => this.addSaving(id),
			removeSaving: (id, generation) => this.removeSaving(id, generation),
			save: (id) => this.save(id),
			update: (id, changes) => this.update(id, changes),
			setSavedShareId: (id, shareId) => this.library.setSavedShareId(id, shareId),
			setSavedTitleKey: (id, titleKey) => this.library.setSavedTitleKey(id, titleKey),
			setError: (message) => (this.error = message)
		});

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

	get user() {
		return this.auth.user;
	}
	set user(value: User | null) {
		this.auth.user = value;
	}
	get ready() {
		return this.auth.ready;
	}
	set ready(value: boolean) {
		this.auth.ready = value;
	}
	get busy() {
		return this.auth.busy;
	}
	set busy(value: boolean) {
		this.auth.busy = value;
	}
	get loading() {
		return this.library.loading;
	}
	set loading(value: boolean) {
		this.library.loading = value;
	}
	get connectionFailed() {
		return this.library.connectionFailed;
	}
	set connectionFailed(value: boolean) {
		this.library.connectionFailed = value;
	}
	get offline() {
		return this.library.offline;
	}
	set offline(value: boolean) {
		this.library.offline = value;
	}
	get pendingSync() {
		return this.library.pendingSync;
	}
	set pendingSync(value: boolean) {
		this.library.pendingSync = value;
	}
	get tabs() {
		return this.library.tabs;
	}
	set tabs(value: CloudTab[]) {
		this.library.tabs = value;
	}
	get uploadErrors() {
		return this.uploads.uploadErrors;
	}
	set uploadErrors(value: Record<string, string>) {
		this.uploads.uploadErrors = value;
	}
	private get generation() {
		return this.auth.generation;
	}

	startFromSessionHint() {
		this.auth.startFromSessionHint();
	}

	skipInitialSessionCheck() {
		this.auth.skipInitialSessionCheck();
	}

	prewarmLogin() {
		this.auth.prewarmLogin();
	}

	ensure(): Promise<FirebaseServices> {
		return this.auth.ensure();
	}

	connect() {
		const user = this.user;
		if (!user) return;
		this.uploads.clearAttempts();
		this.library.connect(user);
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

	syncBrowserTabs(allowBusy = false): Promise<void> {
		return this.uploads.syncBrowserTabs(allowBusy);
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

	login() {
		return this.auth.login();
	}

	logout() {
		return this.auth.logout();
	}

	update(id: string, changes: Partial<Pick<BassTab, 'title' | 'artist' | 'tuningId' | 'source'>>) {
		const tab = this.get(id);
		if (!tab || !this.user) throw new Error('Sign in to edit this cloud tab.');
		if (!this.library.hasSavedTitleKey(id) && !this.dirty.includes(id))
			this.library.setSavedTitleKey(id, cloudTitleKey(tab.title));
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

	upload(local: BassTab): Promise<string> {
		return this.uploads.upload(local);
	}

	replaceFromLocal(local: BassTab, id: string): Promise<string> {
		return this.uploads.replaceFromLocal(local, id);
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
		this.addSaving(id);
		const resolvedOldShareId =
			oldShareId === undefined
				? (this.library.getSavedShareId(id) ?? snapshot.shareId)
				: oldShareId;
		const needsServerTitleCheck =
			this.library.getSavedTitleKey(id) !== cloudTitleKey(snapshot.title);
		const operation = firebase.then(({ db, firestoreSdk }) =>
			needsServerTitleCheck
				? writeCloudTab(db, snapshot, user.uid, resolvedOldShareId, false, firestoreSdk)
				: queueCloudTabWrite(db, snapshot, user.uid, resolvedOldShareId, firestoreSdk)
		);
		this.writes.set(id, operation);
		try {
			await operation;
			if (this.generation === generation) {
				this.library.setSavedShareId(id, snapshot.shareId);
				this.library.setSavedTitleKey(id, cloudTitleKey(snapshot.title));
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
			this.removeSaving(id, generation);
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
		const shareId = this.library.hasSavedShareId(id)
			? this.library.getSavedShareId(id)
			: tab.shareId;
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
				this.library.deleteSavedShareId(id);
				this.library.deleteSavedTitleKey(id);
				this.cacheDrafts();
			}
		} finally {
			if (this.writes.get(id) === operation) this.writes.delete(id);
		}
	}

	private handleUserChanged(user: User | null) {
		if (this.dirty.length) {
			this.error =
				'Your account changed before cloud edits were saved. Sign back into the previous account to restore drafts if the browser backup succeeded.';
		}
		this.library.reset();
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
		this.revisions.clear();
		this.dirty = [];
		this.saving = [];
		this.movingToBrowser = [];
		this.uploads.reset();
		if (!user) return;
		const dirty = this.library.restoreDrafts(user.uid);
		if (dirty) this.dirty = dirty;
		this.loading = true;
		this.connect();
	}

	private async prepareSignOut(generation: number) {
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
	}

	private cacheDrafts() {
		return this.library.cacheDrafts(this.user);
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

	private addSaving(id: string) {
		this.saving.push(id);
	}

	private removeSaving(id: string, generation: number) {
		if (this.generation === generation) this.saving = this.saving.filter((key) => key !== id);
	}
}

export const cloudStore = new CloudStore();

import type { User } from 'firebase/auth';
import { SvelteMap } from 'svelte/reactivity';
import { type FirebaseServices } from '$lib/firebase';
import { tabStore, type BassTab } from '$lib/stores/tabs.svelte';
import { cloudTitleConflict, cloudTitleKey, errorMessage, type CloudTab } from './model';
import { writeCloudTab } from './write';

interface CloudUploadHost {
	ensure: () => Promise<FirebaseServices>;
	getUser: () => User | null;
	getGeneration: () => number;
	getLoading: () => boolean;
	getConnectionFailed: () => boolean;
	getBusy: () => boolean;
	getTabs: () => CloudTab[];
	setTabs: (tabs: CloudTab[]) => void;
	getWrites: () => Map<string, Promise<void>>;
	get: (id: string) => CloudTab | undefined;
	addSaving: (id: string) => void;
	removeSaving: (id: string, generation: number) => void;
	save: (id: string) => Promise<void>;
	update: (
		id: string,
		changes: Partial<Pick<BassTab, 'title' | 'artist' | 'tuningId' | 'source'>>
	) => boolean | undefined;
	setSavedShareId: (id: string, shareId: string | null) => void;
	setSavedTitleKey: (id: string, titleKey: string) => void;
	setError: (message: string) => void;
}

export class CloudUploadQueue {
	uploadErrors = $state<Record<string, string>>({});
	private uploadAttempts = new SvelteMap<string, string>();
	private syncTask?: { generation: number; promise: Promise<void> };

	constructor(private host: CloudUploadHost) {}

	reset() {
		this.uploadErrors = {};
		this.uploadAttempts.clear();
		this.syncTask = undefined;
	}

	clearAttempts() {
		this.uploadAttempts.clear();
	}

	async syncBrowserTabs(allowBusy = false): Promise<void> {
		const user = this.host.getUser();
		const generation = this.host.getGeneration();
		if (
			!user ||
			this.host.getLoading() ||
			this.host.getConnectionFailed() ||
			(this.host.getBusy() && !allowBusy)
		)
			return;
		if (this.syncTask?.generation === generation) {
			await this.syncTask.promise;
			if (this.host.getGeneration() === generation) return this.syncBrowserTabs(allowBusy);
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

	async upload(local: BassTab): Promise<string> {
		const user = this.host.getUser();
		if (!user) throw new Error('Sign in to save tabs to the cloud.');
		const firebase = this.host.ensure();
		if (this.host.getWrites().has(local.id))
			throw new Error('This tab already has a cloud save in progress.');
		const conflict = cloudTitleConflict(local.title, this.host.getTabs());
		if (conflict) throw new Error(conflict);
		if (local.cloudOwnerId && local.cloudOwnerId !== user.uid) {
			throw new Error(
				'This pending cloud save belongs to another account. Sign into that account, or choose Browser only under Save location first.'
			);
		}
		if (tabStore.get(local.id)) {
			tabStore.put({ ...local, browserOnly: false, cloudOwnerId: user.uid });
		}
		const generation = this.host.getGeneration();
		const tab: CloudTab = {
			...local,
			visibility: 'private',
			shareId: null
		};
		this.host.addSaving(tab.id);
		const writes = this.host.getWrites();
		const operation = firebase.then(({ db, firestoreSdk }) =>
			writeCloudTab(db, tab, user.uid, null, true, firestoreSdk)
		);
		writes.set(tab.id, operation);
		try {
			await operation;
			if (this.host.getGeneration() !== generation) {
				throw new Error(
					'Saved to the previous account. Your browser tab was kept; sign back in to continue.'
				);
			}
			if (!this.host.get(tab.id)) this.host.setTabs([...this.host.getTabs(), tab]);
			this.host.setSavedShareId(tab.id, null);
			this.host.setSavedTitleKey(tab.id, cloudTitleKey(tab.title));
			this.finishPromotion(local.id, tab);
			delete this.uploadErrors[local.id];
			return tab.id;
		} finally {
			if (writes.get(tab.id) === operation) writes.delete(tab.id);
			this.host.removeSaving(tab.id, generation);
		}
	}

	async replaceFromLocal(local: BassTab, id: string): Promise<string> {
		const user = this.host.getUser();
		if (!this.host.get(id) || !user)
			throw new Error('Sign in and load the existing cloud tab first.');
		if (local.cloudOwnerId && local.cloudOwnerId !== user.uid) {
			throw new Error(
				'This pending save belongs to another account. Choose Browser only under Save location before moving it to this account.'
			);
		}
		const generation = this.host.getGeneration();
		const snapshot = { ...local };
		const { title, artist, tuningId, source } = snapshot;
		this.host.update(id, { title, artist, tuningId, source });
		await this.host.save(id);
		if (this.host.getGeneration() !== generation) {
			throw new Error(
				'Saved to the previous account. Your browser tab was kept; sign back in to continue.'
			);
		}
		this.finishPromotion(local.id, snapshot, id);
		return id;
	}

	private async promoteBrowserTabs(user: User, generation: number, allowBusy: boolean) {
		for (const candidate of [...tabStore.tabs]) {
			if (
				this.host.getGeneration() !== generation ||
				this.host.getConnectionFailed() ||
				(this.host.getBusy() && !allowBusy)
			)
				break;
			const local = tabStore.get(candidate.id);
			if (
				!local ||
				local.browserOnly ||
				this.host.get(local.id) ||
				this.host.getWrites().has(local.id) ||
				(local.cloudOwnerId && local.cloudOwnerId !== user.uid)
			)
				continue;
			const fingerprint = JSON.stringify(local);
			if (this.uploadAttempts.get(local.id) === fingerprint) continue;
			this.uploadAttempts.set(local.id, fingerprint);
			try {
				await this.upload(local);
				if (this.host.getGeneration() === generation) delete this.uploadErrors[local.id];
			} catch (error) {
				if (this.host.getGeneration() !== generation) break;
				const message = errorMessage(error);
				this.uploadErrors[local.id] = message;
				this.host.setError(
					`Could not automatically save "${local.title}" to the cloud: ${message} Your browser version was kept.`
				);
				const latest = tabStore.get(local.id);
				if (latest) this.uploadAttempts.set(local.id, JSON.stringify(latest));
			}
		}
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
			if (!this.host.update(cloudId, { title, artist, tuningId, source })) {
				throw new Error(
					'Cloud saving was enabled, but newer edits could not be backed up. Your browser tab was kept.'
				);
			}
		}
		tabStore.remove(localId);
	}
}

import type { BassTab } from '$lib/stores/tabs.svelte';
import { TUNINGS } from '$lib/tab/tuning';

export type Visibility = 'private' | 'unlisted' | 'public';
export interface CloudTab extends BassTab {
	visibility: Visibility;
	shareId: string | null;
}

export function cloudData(tab: CloudTab) {
	return {
		title: tab.title,
		artist: tab.artist,
		tuningId: tab.tuningId,
		source: tab.source,
		syntaxVersion: tab.syntaxVersion,
		createdAt: tab.createdAt,
		updatedAt: tab.updatedAt,
		visibility: tab.visibility,
		shareId: tab.shareId
	};
}

export function cloudTitleKey(title: string): string {
	return title.trim().toLowerCase();
}

export function cloudTitleConflict(
	title: string,
	tabs: Pick<CloudTab, 'id' | 'title'>[],
	excludeId?: string
): string {
	return tabs.some(
		(other) => other.id !== excludeId && cloudTitleKey(other.title) === cloudTitleKey(title)
	)
		? `You already have a cloud tab named "${title.trim() || 'Untitled tab'}". You can't have two cloud saves with the same title. Choose a different title, or open the existing cloud tab to edit it.`
		: '';
}

export function assertUniqueCloudTitle(
	tab: Pick<CloudTab, 'id' | 'title'>,
	tabs: Pick<CloudTab, 'id' | 'title'>[]
) {
	const conflict = cloudTitleConflict(tab.title, tabs, tab.id);
	if (conflict) throw new Error(conflict);
}

export function readCloudTab(id: string, data: Record<string, unknown>): CloudTab {
	if (
		typeof data.title !== 'string' ||
		data.title.length > 200 ||
		typeof data.artist !== 'string' ||
		data.artist.length > 200 ||
		typeof data.source !== 'string' ||
		data.source.length > 200000 ||
		typeof data.tuningId !== 'string' ||
		!TUNINGS.some((t) => t.id === data.tuningId) ||
		data.syntaxVersion !== 2 ||
		typeof data.createdAt !== 'number' ||
		!Number.isFinite(data.createdAt) ||
		typeof data.updatedAt !== 'number' ||
		!Number.isFinite(data.updatedAt) ||
		(data.visibility !== 'private' &&
			data.visibility !== 'unlisted' &&
			data.visibility !== 'public') ||
		(data.shareId !== null && typeof data.shareId !== 'string') ||
		(data.visibility === 'private'
			? data.shareId !== null
			: typeof data.shareId !== 'string' || !/^[a-f0-9]{32}$/.test(data.shareId))
	) {
		throw new Error('Invalid cloud tab data. Please reload or contact support.');
	}
	return {
		id,
		title: data.title,
		artist: data.artist,
		source: data.source,
		tuningId: data.tuningId,
		syntaxVersion: 2,
		createdAt: data.createdAt,
		updatedAt: data.updatedAt,
		visibility: data.visibility,
		shareId: data.shareId
	};
}

export function shareToken(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
		b.toString(16).padStart(2, '0')
	).join('');
}

export function errorMessage(error: unknown): string {
	if (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === 'permission-denied'
	) {
		return 'Cloud access was denied. Your tab has not been saved. Try signing in again. If this continues, the site administrator needs to deploy the latest Firestore rules; changing the title will not fix an access problem.';
	}
	return error instanceof Error ? error.message : String(error);
}

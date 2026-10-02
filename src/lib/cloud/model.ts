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
	return error instanceof Error ? error.message : String(error);
}

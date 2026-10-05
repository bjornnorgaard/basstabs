import type { CloudTab } from '$lib/cloud/model';

export function filterLoadedPublicTabs(tabs: CloudTab[], query: string): CloudTab[] {
	const q = query.trim().toLowerCase();
	if (!q) return tabs;
	return tabs.filter((tab) => `${tab.title} ${tab.artist}`.toLowerCase().includes(q));
}

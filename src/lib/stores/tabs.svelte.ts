import { browser } from '$app/environment';
import { EXAMPLE_SOURCE } from '$lib/tab/example';
import { migrateLegacySource } from '$lib/tab/migrate';
import { DEFAULT_TUNING_ID, getTuning } from '$lib/tab/tuning';

export interface BassTab {
	id: string;
	title: string;
	artist: string;
	tuningId: string;
	source: string;
	syntaxVersion: 2;
	createdAt: number;
	updatedAt: number;
	browserOnly?: boolean;
	cloudOwnerId?: string;
}

const STORAGE_KEY = 'basstabs:tabs';

function load(): BassTab[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed)
			? parsed.map((tab) => ({
					...tab,
					source:
						tab.syntaxVersion === 2
							? tab.source
							: migrateLegacySource(tab.source, getTuning(tab.tuningId)),
					syntaxVersion: 2
				}))
			: [];
	} catch {
		return [];
	}
}

class TabStore {
	tabs = $state<BassTab[]>(load());

	sorted = $derived([...this.tabs].sort((a, b) => b.updatedAt - a.updatedAt));

	constructor() {
		if (!browser) return;
		$effect.root(() => {
			$effect(() => {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tabs));
			});
		});
		// Keep multiple open windows in sync.
		window.addEventListener('storage', (e) => {
			if (e.key === STORAGE_KEY) this.tabs = load();
		});
	}

	get(id: string): BassTab | undefined {
		return this.tabs.find((t) => t.id === id);
	}

	create(init: Partial<Omit<BassTab, 'id' | 'createdAt' | 'updatedAt'>> = {}): BassTab {
		const now = Date.now();
		const tab: BassTab = {
			id: crypto.randomUUID(),
			title: 'Untitled tab',
			artist: '',
			tuningId: DEFAULT_TUNING_ID,
			source: EXAMPLE_SOURCE,
			...init,
			syntaxVersion: 2,
			createdAt: now,
			updatedAt: now
		};
		this.tabs.push(tab);
		return tab;
	}

	update(id: string, changes: Partial<Omit<BassTab, 'id' | 'createdAt'>>) {
		const tab = this.get(id);
		if (!tab) return;
		Object.assign(tab, changes, { updatedAt: Date.now() });
	}

	duplicate(id: string): BassTab | undefined {
		const tab = this.get(id);
		if (!tab) return;
		const { title, artist, tuningId, source } = tab;
		return this.create({ title: `${title} (copy)`, artist, tuningId, source });
	}

	put(tab: BassTab) {
		const tabs = [...this.tabs.filter((existing) => existing.id !== tab.id), tab];
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
		this.tabs = tabs;
	}

	keepBrowserOnly(tab: BassTab) {
		const { id, title, artist, tuningId, source, syntaxVersion, createdAt, updatedAt } = tab;
		this.put({
			id,
			title,
			artist,
			tuningId,
			source,
			syntaxVersion,
			createdAt,
			updatedAt,
			browserOnly: true
		});
	}

	remove(id: string) {
		const remaining = this.tabs.filter((t) => t.id !== id);
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
		this.tabs = remaining;
	}
}

export const tabStore = new TabStore();

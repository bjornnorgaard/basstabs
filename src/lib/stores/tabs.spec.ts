import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLE_SOURCE } from '$lib/tab/example';
import { tabStore } from './tabs.svelte';

vi.mock('$app/environment', () => ({ browser: false }));

afterEach(() => {
	for (const tab of [...tabStore.tabs]) tabStore.remove(tab.id);
});

describe('tab creation', () => {
	it('prefills new tabs with editable example source', () => {
		const tab = tabStore.create();
		expect(tab.source).toBe(EXAMPLE_SOURCE);
		tabStore.update(tab.id, { source: 'E3 |' });
		expect(tabStore.get(tab.id)?.source).toBe('E3 |');
		expect(tabStore.create().source).toBe(EXAMPLE_SOURCE);
	});

	it.each(['', 'B0 2 |'])('preserves explicit source %j when saving or duplicating', (source) => {
		const tab = tabStore.create({ title: 'Shared tab', tuningId: 'standard-5', source });
		expect(tab.source).toBe(source);
		expect(tabStore.duplicate(tab.id)).toMatchObject({
			title: 'Shared tab (copy)',
			tuningId: 'standard-5',
			source
		});
	});

	it('duplicates an opted-out tab using default storage, not inheriting its opt-out', () => {
		const tab = tabStore.create({ title: 'Browser riff', browserOnly: true });
		expect(tabStore.duplicate(tab.id)?.browserOnly).toBeUndefined();
	});
});

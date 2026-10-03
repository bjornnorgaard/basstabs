import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { BassTab } from '$lib/stores/tabs.svelte';

const mocks = vi.hoisted(() => ({
	cloud: {
		user: { uid: 'owner' },
		tabs: [{ id: 'saved', title: 'Riff' }],
		saving: [],
		get: () => undefined
	}
}));
vi.mock('$lib/stores/cloud.svelte', () => ({ cloudStore: mocks.cloud }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('$app/state', () => ({ page: { url: new URL('https://example.com') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/toaster', () => ({ toaster: { error: vi.fn(), success: vi.fn() } }));

import CloudTabControls from '$lib/components/CloudTabControls.svelte';

const tab: BassTab = {
	id: 'local',
	title: ' riff ',
	artist: '',
	source: 'E0',
	tuningId: 'standard-4',
	syntaxVersion: 2,
	createdAt: 1,
	updatedAt: 1
};

describe('cloud copy controls', () => {
	it('shows an accessible duplicate warning beside the upload button', () => {
		const { body } = render(CloudTabControls, { props: { tab } });
		expect(body).toContain('Save a cloud copy');
		expect(body).toContain('aria-describedby="cloud-copy-error"');
		expect(body).toContain('role="alert"');
		expect(body).toContain('two cloud saves with the same title');
	});

	it('removes the duplicate warning for a distinct title', () => {
		const { body } = render(CloudTabControls, {
			props: { tab: { ...tab, title: 'Riff 2' } }
		});
		expect(body).not.toContain('cloud-copy-error');
		expect(body).not.toContain('two cloud saves with the same title');
	});
});

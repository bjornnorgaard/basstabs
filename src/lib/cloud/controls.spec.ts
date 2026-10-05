import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { BassTab } from '$lib/stores/tabs.svelte';
import type { CloudTab } from './model';

const mocks = vi.hoisted(() => ({
	cloud: {
		user: { uid: 'owner' },
		tabs: [{ id: 'saved', title: 'Riff' }],
		saving: [] as string[],
		dirty: [] as string[],
		movingToBrowser: [] as string[],
		offline: false,
		uploadErrors: {} as Record<string, string>,
		get: vi.fn<(id: string) => CloudTab | undefined>(() => undefined)
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

describe('cloud saving controls', () => {
	it('shows an accessible duplicate warning beside the upload button', () => {
		const { body } = render(CloudTabControls, { props: { tab } });
		expect(body).toContain('Update existing cloud tab');
		expect(body).toContain('aria-describedby="cloud-save-error"');
		expect(body).toContain('role="alert"');
		expect(body).toContain('two cloud saves with the same title');
		expect(body).toContain('Update existing cloud tab');
		expect(body).toContain('Open existing cloud tab');
	});

	it('removes the duplicate warning for a distinct title', () => {
		const { body } = render(CloudTabControls, {
			props: { tab: { ...tab, title: 'Riff 2' } }
		});
		expect(body).not.toContain('cloud-save-error');
		expect(body).not.toContain('two cloud saves with the same title');
		expect(body).not.toContain('Update existing cloud tab');
		expect(body).toContain('Cloud save pending');
		expect(body).toContain('Save location');
		expect(body).toContain('Browser only');
		expect(body).not.toContain('Retry save</button>');
	});

	it('remembers explicit browser-only storage while signed in', () => {
		const { body } = render(CloudTabControls, {
			props: { tab: { ...tab, title: 'Local riff', browserOnly: true } }
		});
		expect(body).toContain('Saved in this browser');
		expect(body).toContain('value="browser" selected');
		expect(body).toContain('Cloud account');
		expect(body).not.toContain('Cloud save pending');
	});

	it('shows automatic save failures beside retry', () => {
		mocks.cloud.uploadErrors.local = 'offline';
		try {
			const { body } = render(CloudTabControls, {
				props: { tab: { ...tab, title: 'New riff' } }
			});
			expect(body).toContain('offline');
			expect(body).toContain('role="alert"');
			expect(body).toContain('Retry save');
		} finally {
			mocks.cloud.uploadErrors = {};
		}
	});

	it('labels the save location and keeps detailed help collapsed by default', () => {
		const { body } = render(CloudTabControls, {
			props: { tab: { ...tab, title: 'Local riff', browserOnly: true } }
		});
		expect(body).toContain('aria-label="Storage and sharing"');
		expect(body).toContain('aria-describedby="tab-save-status"');
		expect(body).toContain('About storage and sharing');
		expect(body).not.toMatch(/<details[^>]*\bopen\b/);
	});

	it('disables storage changes and shows progress while moving to browser storage', () => {
		mocks.cloud.get.mockReturnValue({ ...tab, visibility: 'private', shareId: null });
		mocks.cloud.movingToBrowser = [tab.id];
		try {
			const { body } = render(CloudTabControls, { props: { tab } });
			expect(body).toContain('Moving to browser...');
			expect(body).toMatch(/<select[^>]*disabled/);
			expect(body).not.toContain('Saved to cloud');
		} finally {
			mocks.cloud.get.mockReturnValue(undefined);
			mocks.cloud.movingToBrowser = [];
		}
	});

	it('keeps account-free browser editing clear', () => {
		const previous = mocks.cloud.user;
		Object.assign(mocks.cloud, { user: null });
		try {
			const { body } = render(CloudTabControls, { props: { tab } });
			expect(body).toContain('Saved in this browser');
			expect(body).toContain('Sign in for cloud saving');
			expect(body).not.toContain('Enable cloud saving</button>');
			expect(body).not.toContain('Update existing cloud tab');
		} finally {
			mocks.cloud.user = previous;
		}
	});

	it.each([
		{ saving: [], dirty: [], label: 'Saved to cloud' },
		{ saving: ['local'], dirty: ['local'], label: 'Saving...' },
		{ saving: [], dirty: ['local'], label: 'Unsaved changes' }
	])('shows the status of a cloud-backed tab: $label', ({ saving, dirty, label }) => {
		mocks.cloud.get.mockReturnValue({ ...tab, visibility: 'private', shareId: null });
		mocks.cloud.saving = saving;
		mocks.cloud.dirty = dirty;
		try {
			const { body } = render(CloudTabControls, { props: { tab } });
			expect(body).toContain('Save location');
			expect(body).toContain('value="cloud" selected');
			expect(body).toContain(label);
			expect(body).toContain('Browser only');
			expect(body).not.toContain('Enable cloud saving</button>');
			expect(body).toContain('Visibility');
			expect(body).toContain('Copy live link');
			expect(body).toContain('select h-12 w-full min-w-0 pl-10');
			expect(body).toContain('class="min-w-0 gap-1"');
			expect(body).toContain('class="h-12 items-center py-1"');
			if (dirty.length) expect(body).toContain('Retry save');
			else expect(body).not.toContain('Retry save</button>');
		} finally {
			mocks.cloud.get.mockReturnValue(undefined);
			mocks.cloud.saving = [];
			mocks.cloud.dirty = [];
		}
	});

	it('shows offline pending cloud edits without a retry action', () => {
		mocks.cloud.get.mockReturnValue({ ...tab, visibility: 'private', shareId: null });
		mocks.cloud.dirty = [tab.id];
		mocks.cloud.offline = true;
		try {
			const { body } = render(CloudTabControls, { props: { tab } });
			expect(body).toContain('Offline — changes will sync when online');
			expect(body).not.toContain('Retry save</button>');
		} finally {
			mocks.cloud.get.mockReturnValue(undefined);
			mocks.cloud.dirty = [];
			mocks.cloud.offline = false;
		}
	});
});

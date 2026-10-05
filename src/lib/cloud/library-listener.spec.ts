import { describe, expect, it } from 'vitest';
import { mocks, store, tab } from './store.spec.fixtures';

describe('cloud library listener', () => {
	it('shows cached snapshots as offline pending sync instead of failed connection', async () => {
		const cloud = await store();
		const next = mocks.onSnapshot.mock.calls.at(-1)?.[2];
		expect(next).toBeDefined();
		next?.({
			docs: [{ id: tab.id, data: () => ({ ...tab, source: 'E9' }) }],
			metadata: { fromCache: true, hasPendingWrites: true }
		});
		expect(cloud.offline).toBe(true);
		expect(cloud.pendingSync).toBe(true);
		expect(cloud.connectionFailed).toBe(false);
		expect(cloud.get(tab.id)?.source).toBe('E9');
	});

	it('can delete a tab even when its unsaved draft is invalid', async () => {
		const cloud = await store();
		cloud.update(tab.id, { title: 'x'.repeat(201) });
		await cloud.remove(tab.id);
		expect(mocks.delete).toHaveBeenCalledWith(`users/owner/tabs/${tab.id}`);
		expect(mocks.set).not.toHaveBeenCalled();
		expect(cloud.tabs).toEqual([]);
		expect(cloud.dirty).toEqual([]);
	});

	it('explains denied cloud reads and reconnects without discarding drafts', async () => {
		const cloud = await store();
		cloud.update(tab.id, { source: 'E8' });
		const subscription = mocks.onSnapshot.mock.calls.at(-1);
		expect(subscription).toBeDefined();
		subscription?.[3]({ code: 'permission-denied' });
		expect(cloud.connectionFailed).toBe(true);
		expect(cloud.loading).toBe(false);
		expect(cloud.error).toContain('Google sign-in succeeded');
		expect(cloud.error).toContain('(default)');
		expect(cloud.error).toContain('basstabs-by-bear');
		cloud.connect();
		expect(mocks.onSnapshot).toHaveBeenCalledTimes(2);
		expect(cloud.connectionFailed).toBe(false);
		expect(cloud.loading).toBe(true);
		expect(cloud.get(tab.id)?.source).toBe('E8');
		expect(cloud.dirty).toContain(tab.id);
		await cloud.save(tab.id);
	});
});

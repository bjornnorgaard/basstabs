import { describe, expect, it } from 'vitest';
import type { User } from 'firebase/auth';
import { mocks, store, tab, user } from './store.spec.fixtures';

describe('cloud auth session', () => {
	it('waits for automatic uploads before signing out and refuses sign-out after a failed upload', async () => {
		const cloud = await store();
		cloud.loading = false;
		const first = cloud.create({ title: 'First song' });
		await cloud.logout();
		expect(cloud.get(first.id)).toBeDefined();
		expect(mocks.signOut).toHaveBeenCalledTimes(1);
		expect(mocks.clearCache).toHaveBeenCalledTimes(1);
		mocks.signOut.mockClear();
		mocks.clearCache.mockClear();
		const second = cloud.create({ title: 'Second song' });
		mocks.commit.mockRejectedValueOnce(new Error('offline'));
		await cloud.logout();
		expect(cloud.uploadErrors[second.id]).toBe('offline');
		expect(mocks.signOut).not.toHaveBeenCalled();
		expect(cloud.error).toContain('Browser only under Save location');
		await cloud.keepBrowserOnly(second.id);
		await cloud.logout();
		expect(mocks.signOut).toHaveBeenCalledTimes(1);
		expect(mocks.clearCache).toHaveBeenCalledTimes(1);
	});

	it('clears account tabs on sign-out and rejects unauthenticated uploads', async () => {
		const cloud = await store();
		mocks.authChange?.(null);
		expect(cloud.tabs).toEqual([]);
		await expect(cloud.upload(tab)).rejects.toThrow('Sign in');
	});

	it.each(['Riff', ' riff ', 'RIFF'])(
		'rejects duplicate upload title %s from the server',
		async (title) => {
			const cloud = await store();
			cloud.tabs = [];
			mocks.library.mockResolvedValue({ docs: [{ id: tab.id, data: () => tab }] });
			await expect(cloud.upload({ ...tab, id: 'local-id', title })).rejects.toThrow(
				'different title'
			);
			expect(mocks.commit).not.toHaveBeenCalled();
			expect(cloud.tabs).toEqual([]);
		}
	);

	it('restores unsaved drafts only for the matching account', async () => {
		const cloud = await store();
		cloud.update(tab.id, { source: 'E9' });
		mocks.authChange?.({ uid: 'another-owner' } as User);
		expect(cloud.tabs).toEqual([]);
		mocks.authChange?.(user);
		expect(cloud.get(tab.id)?.source).toBe('E9');
		expect(cloud.dirty).toContain(tab.id);
		await cloud.save(tab.id);
		expect(localStorage.getItem('basstabs:cloud-drafts:owner')).toBeNull();
	});
});

import { cloudStore } from '$lib/stores/cloud.svelte';

export async function buildLiveShareUrl(base: string, id: string): Promise<string> {
	const url = new URL(base);
	const tab = cloudStore.get(id);
	if (!tab) throw new Error('Cloud tab not found.');
	if (tab.visibility === 'private') await cloudStore.setVisibility(id, 'unlisted');
	else await cloudStore.save(id);
	const token = cloudStore.get(id)?.shareId;
	if (!token) throw new Error('Could not enable live sharing.');
	url.searchParams.set('id', token);
	return url.href;
}

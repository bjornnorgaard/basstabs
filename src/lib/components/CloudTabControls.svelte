<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { cloudStore } from '$lib/stores/cloud.svelte';
	import type { BassTab } from '$lib/stores/tabs.svelte';
	import { errorMessage, type Visibility } from '$lib/cloud/model';
	import { toaster } from '$lib/toaster';

	let { tab }: { tab: BassTab } = $props();
	let busy = $state(false);
	const cloud = $derived(cloudStore.get(tab.id));

	async function perform(action: () => Promise<void>) {
		busy = true;
		try {
			await action();
		} catch (error) {
			toaster.error({ title: 'Cloud operation failed', description: errorMessage(error) });
		} finally {
			busy = false;
		}
	}

	async function upload() {
		await perform(async () => {
			const id = await cloudStore.upload(tab);
			toaster.success({
				title: 'Saved a private cloud copy',
				description: 'Your original local tab is unchanged.'
			});
			await goto(resolve('/tab/[id]', { id }));
		});
	}

	async function visibility(value: string) {
		if (!['private', 'unlisted', 'public'].includes(value)) return;
		await perform(() => cloudStore.setVisibility(tab.id, value as Visibility));
	}

	async function share() {
		await perform(async () => {
			await cloudStore.save(tab.id);
			const token = cloudStore.get(tab.id)?.shareId;
			if (!token) throw new Error('Enable unlisted or public sharing first.');
			const url = new URL(resolve('/shared'), page.url.origin);
			url.searchParams.set('id', token);
			await navigator.clipboard.writeText(url.href);
			toaster.success({
				title: 'Live link copied',
				description: 'Anyone with this link can view saved updates. The link has no expiry.'
			});
		});
	}
</script>

<section class="space-y-3 card preset-tonal-surface p-4">
	{#if cloud}
		<div class="flex flex-wrap items-center gap-3">
			<strong>Cloud tab</strong>
			<span role="status" class="text-sm">
				{cloudStore.saving.includes(tab.id)
					? 'Saving...'
					: cloudStore.dirty.includes(tab.id)
						? 'Unsaved changes'
						: 'Saved'}
			</span>
			<button
				class="btn preset-tonal btn-sm"
				disabled={busy || cloudStore.saving.includes(tab.id)}
				onclick={() => perform(() => cloudStore.save(tab.id))}>Save / retry</button
			>
			<label class="label">
				<span class="label-text">Visibility</span>
				<select
					class="select"
					value={cloud.visibility}
					disabled={busy}
					onchange={(event) => visibility(event.currentTarget.value)}
				>
					<option value="private">Private - only you</option>
					<option value="unlisted">Unlisted - anyone with the link</option>
					<option value="public">Public - visible to everyone</option>
				</select>
			</label>
			{#if cloud.shareId}
				<button class="btn preset-filled-primary-500 btn-sm" disabled={busy} onclick={share}
					>Copy live link</button
				>
			{/if}
		</div>
		<p class="text-sm opacity-70">
			Edits save automatically when online. Unlisted links can be forwarded; viewers cannot edit
			your original. Making this tab private revokes its live link. Re-enabling sharing creates a
			new link.
		</p>
	{:else}
		<div class="flex flex-wrap items-center gap-3">
			<strong>Saved in this browser</strong>
			{#if cloudStore.user}
				<button class="btn preset-filled-primary-500 btn-sm" disabled={busy} onclick={upload}
					>Save a cloud copy</button
				>
			{:else}
				<button
					class="btn preset-tonal btn-sm"
					disabled={cloudStore.busy}
					onclick={() => cloudStore.login()}>Sign in for cloud saving</button
				>
			{/if}
		</div>
		<p class="text-sm opacity-70">
			Google sign-in is optional. Local editing, playback, export and snapshot sharing work without
			it. Uploading is your choice; signing in does not upload your tabs.
		</p>
	{/if}
</section>

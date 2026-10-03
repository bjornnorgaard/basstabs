<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import { cloudStore } from '$lib/stores/cloud.svelte';
	import type { BassTab } from '$lib/stores/tabs.svelte';
	import { errorMessage } from '$lib/cloud/model';
	import { buildLiveShareUrl } from '$lib/cloud/share';
	import { toaster } from '$lib/toaster';

	let { tab, sharing = false }: { tab: BassTab; sharing?: boolean } = $props();
	let busy = $state(false);
	const cloud = $derived(cloudStore.get(tab.id));
	const disabled = $derived(busy || sharing || cloudStore.saving.includes(tab.id));

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

	async function visibility(value: string | null) {
		await perform(async () => {
			if (value !== 'private' && value !== 'unlisted' && value !== 'public')
				throw new Error('Invalid visibility selection.');
			await cloudStore.setVisibility(tab.id, value);
		});
	}

	async function share() {
		await perform(async () => {
			const url = await buildLiveShareUrl(
				new URL(resolve('/shared'), page.url.origin).href,
				tab.id
			);
			await navigator.clipboard.writeText(url);
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
				{disabled}
				onclick={() => perform(() => cloudStore.save(tab.id))}>Save / retry</button
			>
			<SegmentedControl
				class="min-w-0 basis-full sm:basis-auto"
				value={cloud.visibility}
				{disabled}
				onValueChange={(details) => visibility(details.value)}
			>
				<SegmentedControl.Label>Visibility</SegmentedControl.Label>
				<div class="flex w-full flex-wrap items-center gap-3">
					<SegmentedControl.Control>
						<SegmentedControl.Indicator />
						{#each [{ value: 'public', label: 'Public' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'private', label: 'Private' }] as option (option.value)}
							<SegmentedControl.Item value={option.value}>
								<SegmentedControl.ItemText>{option.label}</SegmentedControl.ItemText>
								<SegmentedControl.ItemHiddenInput />
							</SegmentedControl.Item>
						{/each}
					</SegmentedControl.Control>
					<button
						class="btn w-full preset-filled-primary-500 btn-sm sm:w-auto"
						{disabled}
						onclick={share}>Copy live link</button
					>
				</div>
			</SegmentedControl>
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

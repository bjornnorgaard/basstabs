<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import { cloudStore } from '$lib/stores/cloud.svelte';
	import type { BassTab } from '$lib/stores/tabs.svelte';
	import { cloudTitleConflict, cloudTitleKey, errorMessage } from '$lib/cloud/model';
	import { buildLiveShareUrl } from '$lib/cloud/share';
	import { toaster } from '$lib/toaster';

	let { tab, sharing = false }: { tab: BassTab; sharing?: boolean } = $props();
	let busy = $state(false);
	let uploadFailure = $state<{ title: string; message: string } | null>(null);
	const cloud = $derived(cloudStore.get(tab.id));
	const existing = $derived(
		!cloud && cloudStore.user
			? cloudStore.tabs.find((other) => cloudTitleKey(other.title) === cloudTitleKey(tab.title))
			: undefined
	);
	const titleConflict = $derived(
		cloudStore.user && !cloud ? cloudTitleConflict(tab.title, cloudStore.tabs) : ''
	);
	const uploadMessage = $derived(
		uploadFailure?.title === tab.title
			? uploadFailure.message
			: titleConflict || cloudStore.uploadErrors[tab.id] || ''
	);
	const disabled = $derived(
		busy ||
			sharing ||
			cloudStore.saving.includes(tab.id) ||
			cloudStore.movingToBrowser.includes(tab.id)
	);

	async function keepBrowserOnly() {
		if (
			cloud &&
			!confirm(
				`Keep "${tab.title}" only in this browser? This removes it from your cloud account and revokes any live link. It will no longer be available on other devices.`
			)
		)
			return;
		await perform(async () => {
			await cloudStore.keepBrowserOnly(tab.id);
			toaster.success({
				title: 'Kept in this browser only',
				description: 'This tab will not upload automatically, even when signed in.'
			});
		});
	}

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

	async function upload(replaceId?: string) {
		if (
			replaceId &&
			!confirm(
				`Replace the contents of the existing cloud tab "${tab.title}" with this browser version? Its visibility and live link will be kept. The browser-only entry will be removed after saving succeeds.`
			)
		)
			return;
		await perform(async () => {
			uploadFailure = null;
			let id: string;
			try {
				id = replaceId
					? await cloudStore.replaceFromLocal(tab, replaceId)
					: await cloudStore.upload(tab);
			} catch (error) {
				uploadFailure = { title: tab.title, message: errorMessage(error) };
				throw error;
			}
			toaster.success({
				title: 'Cloud saving enabled',
				description: 'This is now one cloud-backed tab. Future edits save to the same tab.'
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
			<strong>Cloud saving enabled</strong>
			<span role="status" class="text-sm">
				{cloudStore.movingToBrowser.includes(tab.id)
					? 'Moving to browser...'
					: cloudStore.saving.includes(tab.id)
						? 'Saving...'
						: cloudStore.dirty.includes(tab.id)
							? 'Unsaved changes'
							: 'Saved to cloud'}
			</span>
			<button
				class="btn preset-tonal btn-sm"
				{disabled}
				onclick={() => perform(() => cloudStore.save(tab.id))}>Save / retry</button
			>
			<button class="btn preset-tonal btn-sm" {disabled} onclick={keepBrowserOnly}
				>Keep browser only</button
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
			Edits save to this same tab automatically when online. Sign in to access it on any device.
			Unlisted links can be forwarded; viewers cannot edit your original. Making this tab private
			revokes its live link. Re-enabling sharing creates a new link. Titles must be unique within
			your cloud library.
		</p>
	{:else}
		<div class="flex flex-wrap items-center gap-3">
			<strong
				>{cloudStore.user && !tab.browserOnly
					? 'Cloud save pending'
					: 'Saved in this browser'}</strong
			>
			{#if cloudStore.user}
				<button
					class="btn preset-filled-primary-500 btn-sm"
					disabled={disabled || cloudStore.loading || cloudStore.connectionFailed}
					aria-describedby={uploadMessage ? 'cloud-save-error' : undefined}
					onclick={() => upload(existing?.id)}
					>{existing
						? 'Update existing cloud tab'
						: tab.browserOnly
							? 'Enable cloud saving'
							: 'Save / retry'}</button
				>
				{#if existing}
					<a class="btn preset-tonal btn-sm" href={resolve('/tab/[id]', { id: existing.id })}
						>Open existing cloud tab</a
					>
				{/if}
			{:else}
				<button
					class="btn preset-tonal btn-sm"
					disabled={cloudStore.busy}
					onclick={() => cloudStore.login()}>Sign in for cloud saving</button
				>
			{/if}
			{#if !tab.browserOnly}
				<button class="btn preset-tonal btn-sm" {disabled} onclick={keepBrowserOnly}
					>Keep browser only</button
				>
			{/if}
		</div>
		{#if cloudStore.user && uploadMessage}
			<p id="cloud-save-error" role="alert" class="text-sm text-error-500">
				{uploadMessage}
			</p>
		{/if}
		<p class="text-sm opacity-70">
			Google sign-in is optional. Local editing, playback, export and snapshot sharing work without
			it. When signed in, new tabs and existing browser tabs save to your account automatically
			unless you choose “Keep browser only”. That choice is remembered, including after sign-out.
			Cloud-backed tabs require sign-in; browser-only tabs remain available when signed out. Pending
			or failed saves keep a browser backup until saving succeeds. If an older cloud copy has the
			same title, you can update it after confirmation, or rename this tab to keep both.
		</p>
	{/if}
</section>

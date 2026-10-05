<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import Cloud from '@lucide/svelte/icons/cloud';
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
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
	const working = $derived(
		busy || cloudStore.saving.includes(tab.id) || cloudStore.movingToBrowser.includes(tab.id)
	);
	const location = $derived(cloud || (cloudStore.user && !tab.browserOnly) ? 'cloud' : 'browser');
	const status = $derived(
		cloudStore.movingToBrowser.includes(tab.id)
			? 'Moving to browser...'
			: working
				? cloudStore.offline
					? 'Offline — changes will sync'
					: 'Saving...'
				: cloud
					? cloudStore.offline && cloudStore.dirty.includes(tab.id)
						? 'Offline — changes will sync when online'
						: cloudStore.dirty.includes(tab.id)
							? 'Unsaved changes'
							: 'Saved to cloud'
					: location === 'cloud'
						? uploadMessage
							? 'Cloud save needs attention'
							: 'Cloud save pending'
						: 'Saved in this browser'
	);

	async function changeLocation(value: string) {
		if (value === location) return;
		if (value === 'browser') await keepBrowserOnly();
		else if (!cloudStore.user) await cloudStore.login();
		else await upload(existing?.id);
	}

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

<section
	aria-label="Storage and sharing"
	class="grid min-w-0 gap-4 border-t border-surface-200-800 pt-4 md:grid-cols-[2fr_3fr]"
>
	<div class="min-w-0 space-y-2">
		<label class="label min-w-0">
			<span class="label-text">Save location</span>
			<div class="relative">
				{#if location === 'cloud'}
					<Cloud
						class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-60"
					/>
				{:else}
					<HardDrive
						class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-60"
					/>
				{/if}
				<select
					class="select h-12 w-full min-w-0 pl-10"
					value={location}
					onchange={(event) => {
						const value = event.currentTarget.value;
						event.currentTarget.value = location;
						void changeLocation(value);
					}}
					disabled={disabled || cloudStore.busy}
					aria-describedby="tab-save-status"
				>
					<option
						value="cloud"
						disabled={!!cloudStore.user && (cloudStore.loading || cloudStore.connectionFailed)}
						>Cloud account</option
					>
					<option value="browser">Browser only</option>
				</select>
			</div>
		</label>
		<div class="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
			<span
				id="tab-save-status"
				role="status"
				class="inline-flex min-w-0 items-center gap-1.5 text-xs opacity-70"
			>
				{#if working}
					<LoaderCircle class="size-3.5 shrink-0 animate-spin" />
				{:else if (cloud && cloudStore.dirty.includes(tab.id)) || (location === 'cloud' && uploadMessage)}
					<CircleAlert class="size-3.5 shrink-0" />
				{:else if cloud || location === 'browser'}
					<CircleCheck class="size-3.5 shrink-0" />
				{/if}
				{status}
			</span>
			{#if cloud && cloudStore.dirty.includes(tab.id) && !cloudStore.offline}
				<button
					class="btn preset-tonal btn-sm"
					{disabled}
					onclick={() => perform(() => cloudStore.save(tab.id))}>Retry save</button
				>
			{:else if !cloud && cloudStore.user && uploadMessage}
				<button
					class="btn preset-tonal btn-sm"
					disabled={disabled || cloudStore.loading || cloudStore.connectionFailed}
					aria-describedby="cloud-save-error"
					onclick={() => upload(existing?.id)}
					>{existing ? 'Update existing cloud tab' : 'Retry save'}</button
				>
			{/if}
		</div>
		{#if !cloud && cloudStore.user && uploadMessage}
			<p id="cloud-save-error" role="alert" class="text-sm text-error-500">{uploadMessage}</p>
			{#if existing}
				<a
					class="text-sm underline underline-offset-4"
					href={resolve('/tab/[id]', { id: existing.id })}>Open existing cloud tab</a
				>
			{/if}
		{/if}
	</div>

	<div class="min-w-0 space-y-2">
		{#if cloud}
			<SegmentedControl
				class="min-w-0 gap-1"
				value={cloud.visibility}
				{disabled}
				onValueChange={(details) => visibility(details.value)}
			>
				<SegmentedControl.Label class="label-text">Visibility</SegmentedControl.Label>
				<div class="flex w-full flex-wrap items-center gap-3">
					<SegmentedControl.Control class="h-12 items-center py-1">
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
		{:else}
			<div class="label">
				<span class="label-text">Sharing</span>
				<p class="text-sm opacity-70">
					Snapshot links share a fixed copy. Save to your cloud account to enable visibility
					settings and live links.
				</p>
			</div>
			{#if !cloudStore.user}
				<button
					class="btn preset-tonal btn-sm"
					disabled={cloudStore.busy}
					onclick={() => cloudStore.login()}>Sign in for cloud saving</button
				>
			{/if}
		{/if}
	</div>

	<details class="min-w-0 text-xs opacity-70 md:col-span-2">
		<summary class="w-fit cursor-pointer hover:underline">About storage and sharing</summary>
		<p class="mt-2 max-w-3xl leading-relaxed">
			Tabs save automatically to your account when signed in. Choose Browser only to keep a tab on
			this device instead; moving a cloud tab here removes its cloud version and revokes its live
			link after confirmation. This choice is remembered after sign-out. Pending saves keep a
			browser backup. Cloud titles must be unique within your account.
			{#if cloud}
				Live links show saved updates and can be forwarded. Making a tab private revokes its link;
				sharing again creates a new link. Viewers cannot edit your original.
			{:else}
				Sign-in is optional: editing, playback, export and snapshot sharing work without it.
			{/if}
		</p>
	</details>
</section>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { site } from '$lib/site';
	import { page } from '$app/state';
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
	import type { EditorView } from '@codemirror/view';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Eraser from '@lucide/svelte/icons/eraser';
	import Files from '@lucide/svelte/icons/files';
	import FoldVertical from '@lucide/svelte/icons/fold-vertical';
	import Share from '@lucide/svelte/icons/share-2';
	import Trash from '@lucide/svelte/icons/trash';
	import UnfoldVertical from '@lucide/svelte/icons/unfold-vertical';
	import ShorthandEditor from '$lib/components/ShorthandEditor.svelte';
	import SyntaxHelp from '$lib/components/SyntaxHelp.svelte';
	import PlayableTab from '$lib/components/PlayableTab.svelte';
	import { formatErrorReport } from '$lib/error-report';
	import { tabStore } from '$lib/stores/tabs.svelte';
	import type { ParseError } from '$lib/tab/parser';
	import { stringHue } from '$lib/tab/highlight';
	import { renderTab } from '$lib/tab/render';
	import { buildShareUrl } from '$lib/tab/share';
	import { getTuning, TUNINGS } from '$lib/tab/tuning';
	import { toaster } from '$lib/toaster';
	import CloudTabControls from '$lib/components/CloudTabControls.svelte';
	import { cloudStore } from '$lib/stores/cloud.svelte';
	import { errorMessage } from '$lib/cloud/model';
	import { buildLiveShareUrl } from '$lib/cloud/share';

	const cloud = $derived(cloudStore.get(page.params.id ?? ''));
	const tab = $derived(cloud ?? tabStore.get(page.params.id ?? ''));
	const tuning = $derived(getTuning(tab?.tuningId));
	const result = $derived(renderTab(tab?.source ?? '', tuning));
	const seoTitle = $derived(
		tab
			? `${[tab.title || 'Untitled tab', tab.artist].filter(Boolean).join(' – ')} · ${site.name}`
			: `Tab not found · ${site.name}`
	);
	const seoDescription = $derived(
		tab
			? `View, edit, and play the bass tab for “${tab.title || 'Untitled tab'}”${
					tab.artist ? ` by ${tab.artist}` : ''
				} in ${tuning.label}.`
			: 'This bass tab could not be found.'
	);

	let editor = $state<EditorView>();
	let focusedNote = $state<number>();
	let sharing = $state(false);

	const EDITOR_KEY = 'basstabs:editor';
	let editorOpen = $state(localStorage.getItem(EDITOR_KEY) !== 'collapsed');

	function setEditorOpen(open: boolean) {
		editorOpen = open;
		if (!open) focusedNote = undefined;
		localStorage.setItem(EDITOR_KEY, open ? 'open' : 'collapsed');
	}

	const EDITOR_GROW_KEY = 'basstabs:editor-grow';
	let editorGrow = $state(localStorage.getItem(EDITOR_GROW_KEY) === 'grow');

	function toggleEditorGrow() {
		editorGrow = !editorGrow;
		localStorage.setItem(EDITOR_GROW_KEY, editorGrow ? 'grow' : 'fixed');
	}

	function set<K extends 'title' | 'artist' | 'tuningId' | 'source'>(key: K, value: string) {
		if (tab) {
			try {
				if (cloud) cloudStore.update(tab.id, { [key]: value });
				else tabStore.update(tab.id, { [key]: value });
			} catch (error) {
				toaster.error({ title: 'Could not save edit', description: errorMessage(error) });
			}
		}
	}

	function clearSource() {
		if (!editor) return;
		editor.dispatch({
			changes: { from: 0, to: editor.state.doc.length, insert: '' },
			selection: { anchor: 0 }
		});
		editor.focus();
	}

	/** Inserts a snippet at the caret, adding a separating space where needed. */
	function insert(snippet: string) {
		if (!tab || !editor) return;
		const { from, to } = editor.state.selection.main;
		const value = editor.state.doc.toString();
		const before = value.slice(0, from);
		const pad = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
		const text = `${pad}${snippet}`;
		editor.dispatch({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length },
			scrollIntoView: true
		});
		editor.focus();
	}

	function selectError(error: ParseError) {
		if (!tab || !editor) return;
		const lines = tab.source.split('\n');
		const offset =
			lines.slice(0, error.line - 1).reduce((sum, l) => sum + l.length + 1, 0) + error.column - 1;
		editor.dispatch({
			selection: { anchor: offset, head: offset + error.length },
			scrollIntoView: true
		});
		editor.focus();
	}

	function exportText() {
		if (!tab) return '';
		const heading = [tab.title, tab.artist].filter(Boolean).join(' – ');
		return `${heading}\nTuning: ${tuning.strings.join(' ')}\n\n${result.text}\n`;
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(result.text);
			toaster.success({ title: 'Tab copied to clipboard' });
		} catch {
			toaster.error({ title: 'Could not access the clipboard' });
		}
	}

	async function copyErrorReport(errors = result.errors) {
		if (!tab || errors.length === 0) return;
		const report = formatErrorReport({
			title: 'Shorthand parsing error',
			message: `${errors.length} parsing ${errors.length === 1 ? 'error' : 'errors'} found.`,
			details: {
				tabId: tab.id,
				tabTitle: tab.title,
				artist: tab.artist,
				tuning: tuning.label,
				tuningId: tuning.id,
				strings: tuning.strings,
				source: tab.source,
				renderedOutput: result.text,
				errors: errors.map(({ line, column, length, message }) => ({
					line,
					column,
					length,
					message
				}))
			}
		});
		try {
			await navigator.clipboard.writeText(report);
			toaster.success({ title: 'Error report copied to clipboard' });
		} catch {
			toaster.error({ title: 'Could not access the clipboard' });
		}
	}

	async function share() {
		if (!tab) return;
		sharing = true;
		try {
			const base = new URL(resolve('/shared'), page.url.origin).href;
			const { title, artist, tuningId, source } = tab;
			const live = !!cloud;
			const url = live
				? await buildLiveShareUrl(base, tab.id)
				: buildShareUrl(base, { title, artist, tuningId, source });
			await navigator.clipboard.writeText(url);
			toaster.success({
				title: live ? 'Live link copied' : 'Share link copied',
				description: live
					? 'Anyone with this link can view saved updates. The link has no expiry.'
					: 'Anyone with the link can open this tab.'
			});
		} catch (error) {
			toaster.error({ title: 'Could not share tab', description: errorMessage(error) });
		} finally {
			sharing = false;
		}
	}

	function download() {
		if (!tab) return;
		const url = URL.createObjectURL(new Blob([exportText()], { type: 'text/plain' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `${(tab.title || 'tab').replace(/[^\w\- ]+/g, '').trim() || 'tab'}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function duplicate() {
		if (!tab) return;
		const copy = cloudStore.create({
			title: `${tab.title} (copy)`,
			artist: tab.artist,
			tuningId: tab.tuningId,
			source: tab.source
		});
		if (copy) goto(resolve('/tab/[id]', { id: copy.id }));
	}

	async function remove() {
		if (!tab || !confirm(`Delete "${tab.title}"? This cannot be undone.`)) return;
		try {
			if (cloud) await cloudStore.remove(tab.id);
			else tabStore.remove(tab.id);
			await goto(resolve('/'));
		} catch (error) {
			toaster.error({ title: 'Could not delete tab', description: errorMessage(error) });
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
			e.preventDefault();
			copy();
		}
	}
</script>

<svelte:head>
	<meta name="robots" content="noindex, follow" />
	<title>{seoTitle}</title>
	<meta name="description" content={seoDescription} />
	<meta property="og:title" content={seoTitle} />
	<meta property="og:description" content={seoDescription} />
	<meta name="twitter:title" content={seoTitle} />
	<meta name="twitter:description" content={seoDescription} />
</svelte:head>

<svelte:window {onkeydown} />

{#if !tab && (!cloudStore.ready || cloudStore.loading)}
	<p role="status">Loading your tabs...</p>
{:else if !tab}
	<section class="space-y-4 card preset-tonal-surface p-10 text-center">
		<h1 class="h3">Tab not found</h1>
		<p class="opacity-70">It may have been deleted, or it lives in another browser.</p>
		<a class="btn preset-filled-primary-500" href={resolve('/')}>Back to your tabs</a>
	</section>
{:else}
	<div class="space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<a href={resolve('/')} class="btn hover:preset-tonal">
				<ArrowLeft class="size-4" /> All tabs
			</a>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="btn preset-filled-primary-500"
					onclick={copy}
					disabled={!result.text}
				>
					<Copy class="size-4" /> Copy tab
				</button>
				<button
					type="button"
					class="btn preset-tonal"
					onclick={share}
					disabled={sharing || cloudStore.saving.includes(tab.id)}
				>
					<Share class="size-4" />
					{cloud ? 'Copy live link' : 'Snapshot link'}
				</button>
				<button type="button" class="btn preset-tonal" onclick={download} disabled={!result.text}>
					<Download class="size-4" /> .txt
				</button>
				<button type="button" class="btn preset-tonal" onclick={duplicate}>
					<Files class="size-4" /> Duplicate
				</button>
				<button
					type="button"
					class="btn preset-tonal-error"
					onclick={remove}
					disabled={cloudStore.saving.includes(tab.id) ||
						cloudStore.movingToBrowser.includes(tab.id)}
				>
					<Trash class="size-4" /> Delete
				</button>
			</div>
		</div>

		<div class="grid gap-4 md:grid-cols-[2fr_2fr_1fr]">
			<label class="label min-w-0">
				<span class="label-text">Title</span>
				<input
					class="input w-full min-w-0"
					type="text"
					placeholder="Song title"
					bind:value={() => tab.title, (v) => set('title', v)}
				/>
			</label>
			<label class="label min-w-0">
				<span class="label-text">Artist</span>
				<input
					class="input w-full min-w-0"
					type="text"
					placeholder="Artist"
					bind:value={() => tab.artist, (v) => set('artist', v)}
				/>
			</label>
			<label class="label min-w-0">
				<span class="label-text">Tuning</span>
				<select
					class="select w-full min-w-0"
					bind:value={() => tab.tuningId, (v) => set('tuningId', v)}
				>
					{#each TUNINGS as t (t.id)}
						<option value={t.id}>{t.label}</option>
					{/each}
				</select>
			</label>
		</div>

		<CloudTabControls {tab} {sharing} />

		<!-- Side by side from wide desktop width up; stacked on smaller screens. Wide tabs scroll within their column. -->
		<div class="grid grid-cols-1 gap-6 {editorOpen ? 'xl:grid-cols-2' : ''}">
			<Collapsible
				open={editorOpen}
				onOpenChange={(details) => setEditorOpen(details.open)}
				class="min-w-0 items-stretch gap-3"
			>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex items-center gap-1">
						<h2 class="h5">
							<Collapsible.Trigger
								class="-ml-3 btn px-3 hover:preset-tonal"
								title={editorOpen
									? 'Collapse the shorthand editor to focus on the tab'
									: 'Expand the shorthand editor'}
							>
								<ChevronDown class="size-4 transition-transform {editorOpen ? '' : '-rotate-90'}" />
								Shorthand editor
								{#if !editorOpen && result.errors.length > 0}
									<span class="badge preset-filled-error-500">
										{result.errors.length}
										{result.errors.length === 1 ? 'error' : 'errors'}
									</span>
								{/if}
							</Collapsible.Trigger>
						</h2>
					</div>
					{#if editorOpen}
						<div class="flex flex-wrap gap-1" aria-label="Quick insert">
							{#each tuning.strings as name, i (name)}
								<button
									type="button"
									class="btn preset-tonal font-tab btn-sm"
									style:--string-hue={stringHue(name, i)}
									title="Insert {name} string"
									onclick={() => insert(name)}><span class="hl-string">{name}</span></button
								>
							{/each}
							<button
								type="button"
								class="btn preset-tonal font-tab btn-sm"
								title="Insert bar line"
								onclick={() => insert('| ')}>|</button
							>
							<button
								type="button"
								class="ml-8 btn preset-tonal font-tab btn-sm"
								title={editorGrow
									? 'Limit the editor to five lines'
									: 'Expand the editor to fit its content'}
								onclick={toggleEditorGrow}
							>
								{#if editorGrow}
									<FoldVertical class="size-4" /> Shrink editor
								{:else}
									<UnfoldVertical class="size-4" /> Expand editor
								{/if}
							</button>
							<button
								type="button"
								class="btn preset-tonal-error font-tab btn-sm"
								title="Clear shorthand editor"
								aria-label="Clear shorthand editor"
								onclick={clearSource}
								disabled={!tab.source}
							>
								<Eraser class="size-4" /> Clear editor
							</button>
						</div>
					{/if}
				</div>
				<Collapsible.Content class="space-y-3">
					<ShorthandEditor
						bind:editor
						bind:focusedNote
						autoGrow={editorGrow}
						value={tab.source}
						tokens={result.tokens}
						{tuning}
						invalid={result.errors.length > 0}
						placeholder="E0 0 A2 2 | E0 0 3 A2 |"
						oninput={(v) => set('source', v)}
					/>
					<p class="text-xs opacity-60">
						Ctrl/Cmd+D selects the next occurrence; Ctrl/Cmd+Alt+↑/↓ adds a cursor.
					</p>

					{#if result.errors.length > 0}
						<div class="space-y-2 card preset-tonal-error p-3 text-sm" aria-live="polite">
							<ul class="space-y-1">
								{#each result.errors as error (`${error.line}:${error.column}`)}
									<li class="flex items-start justify-between gap-2">
										<button
											type="button"
											class="flex items-start gap-2 text-left hover:underline"
											onclick={() => selectError(error)}
										>
											<CircleAlert class="mt-0.5 size-4 shrink-0" />
											<span
												><strong>Line {error.line}, col {error.column}:</strong>
												{error.message}</span
											>
										</button>
										<button
											type="button"
											class="btn shrink-0 preset-tonal btn-sm"
											aria-label="Copy error report for line {error.line}, column {error.column}"
											onclick={() => copyErrorReport([error])}
										>
											<Copy class="size-4" /> Copy error
										</button>
									</li>
								{/each}
							</ul>
							{#if result.errors.length > 1}
								<button
									type="button"
									class="btn preset-tonal btn-sm"
									onclick={() => copyErrorReport()}
								>
									<Copy class="size-4" /> Copy all errors
								</button>
							{/if}
						</div>
					{/if}

					<SyntaxHelp {tuning} />
				</Collapsible.Content>
			</Collapsible>

			<section class="min-w-0 space-y-3">
				<h2 class="h5">Generated bass tabs</h2>
				<PlayableTab
					layout={result.layout}
					{tuning}
					placeholder="Start typing shorthand to see your tab here."
					class="min-h-64"
					{focusedNote}
				/>
			</section>
		</div>
	</div>
{/if}

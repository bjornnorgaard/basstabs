<script lang="ts">
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Play from '@lucide/svelte/icons/play';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Square from '@lucide/svelte/icons/square';
	import { player } from '$lib/audio/player.svelte';
	import {
		CLEAN_SOUND,
		DEFAULT_SOUND,
		SOUND_CONTROLS,
		SOUND_GROUPS,
		type SoundSettings
	} from '$lib/audio/sound';
	import { DEFAULT_TEST_SOURCE, soundStore } from '$lib/audio/sound-store.svelte';
	import PlayableTab from '$lib/components/PlayableTab.svelte';
	import SoundSlider from '$lib/components/SoundSlider.svelte';
	import { site } from '$lib/site';
	import { renderTab } from '$lib/tab/render';
	import { getTuning, TUNINGS } from '$lib/tab/tuning';
	import { toaster } from '$lib/toaster';

	const tuning = $derived(getTuning(soundStore.test.tuningId));
	const result = $derived(renderTab(soundStore.test.source, tuning));
	const json = $derived(JSON.stringify(soundStore.settings, null, 2));
	const changed = $derived(
		(Object.keys(DEFAULT_SOUND) as (keyof SoundSettings)[]).filter(
			(key) => soundStore.settings[key] !== DEFAULT_SOUND[key]
		).length
	);
	let draft = $state<string | null>(null);
	let draftError = $state('');

	const testFrets = [0, 5, 7, 12];
	const testNotes = $derived(
		tuning.strings.map((name, i) => ({
			name,
			notes: testFrets.map((fret) => ({
				label: `${name}${fret}`,
				midi: tuning.openMidi[i] + fret
			}))
		}))
	);

	function preview(label: string, midi: number) {
		if (player.key === `preview:${midi}`) player.stop();
		else player.preview(midi, `test note ${label}`);
	}

	async function copyJson() {
		try {
			await navigator.clipboard.writeText(json);
			toaster.success({ title: 'Sound settings copied' });
		} catch {
			toaster.error({ title: 'Could not access the clipboard' });
		}
	}

	function downloadJson() {
		const url = URL.createObjectURL(new Blob([`${json}\n`], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = 'basstabs-sound.json';
		link.click();
		URL.revokeObjectURL(url);
	}

	function applyDraft() {
		if (draft === null) return;
		try {
			soundStore.replace(JSON.parse(draft));
			draft = null;
			draftError = '';
			toaster.success({ title: 'Sound settings loaded' });
		} catch {
			draftError = 'That is not valid JSON.';
		}
	}

	function loadPreset(settings: SoundSettings, name: string) {
		if (changed > 0 && !confirm(`Replace your current settings with the ${name} preset?`)) return;
		soundStore.replace(settings);
	}
</script>

<svelte:head>
	<title>Sound design · {site.name}</title>
	<meta name="robots" content="noindex, follow" />
</svelte:head>

<div class="space-y-6">
	<header class="space-y-2">
		<h1 class="h2">Sound design</h1>
		<p class="max-w-3xl opacity-75">
			Shapes the bass used for playback across the app. Every change applies immediately, even while
			a loop is running, and is saved in this browser. Signal flow per note: exciter → string
			waveguide → pickup comb → + sine layer → drive → amp envelope, then on the shared bus:
			high-pass → peaking mid → low-pass → compressor → master. When you have a sound you like, copy
			or download the JSON and send it over; it becomes the new default.
		</p>
	</header>

	<div
		class="sticky top-16 z-[5] flex flex-wrap items-center gap-2 card border border-surface-200-800 bg-surface-50-950/90 p-3 backdrop-blur"
	>
		<span class="text-sm opacity-70">Preset:</span>
		<button
			type="button"
			class="btn preset-tonal btn-sm"
			onclick={() => loadPreset(DEFAULT_SOUND, 'default')}
		>
			<RotateCcw class="size-4" /> Default
		</button>
		<button
			type="button"
			class="btn preset-tonal btn-sm"
			title="No drive, exciter noise or humanising: the bare string model"
			onclick={() => loadPreset(CLEAN_SOUND, 'clean')}
		>
			Clean
		</button>
		<button
			type="button"
			class="btn btn-sm {soundStore.compareDefault ? 'preset-filled-warning-500' : 'preset-tonal'}"
			aria-pressed={soundStore.compareDefault}
			title="Hear the built-in default instead of your settings, without losing them"
			onclick={() => (soundStore.compareDefault = !soundStore.compareDefault)}
		>
			<ArrowLeftRight class="size-4" />
			{soundStore.compareDefault ? 'Hearing default (B)' : 'Hearing yours (A)'}
		</button>
		<span class="ml-auto text-sm opacity-70">
			{changed === 0 ? 'Same as default' : `${changed} changed from default`}
		</span>
		<button type="button" class="btn preset-filled-primary-500 btn-sm" onclick={copyJson}>
			<Copy class="size-4" /> Copy JSON
		</button>
		<button type="button" class="btn preset-tonal btn-sm" onclick={downloadJson}>
			<Download class="size-4" /> Download
		</button>
	</div>

	<div class="grid items-start gap-6 lg:grid-cols-2">
		<div class="space-y-4">
			{#each SOUND_GROUPS as group (group.id)}
				<section class="space-y-4 card preset-tonal-surface p-4">
					<header>
						<h2 class="h5">{group.title}</h2>
						<p class="text-sm opacity-70">{group.description}</p>
					</header>
					{#each SOUND_CONTROLS.filter((c) => c.group === group.id) as control (control.key)}
						<SoundSlider {control} />
					{/each}
				</section>
			{/each}
		</div>

		<div
			class="space-y-4 lg:sticky lg:top-36 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-1"
		>
			<section class="space-y-3 card preset-tonal-surface p-4">
				<header class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="h5">Test riff</h2>
					<div class="flex items-center gap-2">
						<select
							class="select w-auto py-1 text-sm"
							aria-label="Tuning"
							bind:value={soundStore.test.tuningId}
						>
							{#each TUNINGS as option (option.id)}
								<option value={option.id}>{option.label}</option>
							{/each}
						</select>
						<button
							type="button"
							class="btn preset-tonal btn-sm"
							disabled={soundStore.test.source === DEFAULT_TEST_SOURCE}
							onclick={() => (soundStore.test.source = DEFAULT_TEST_SOURCE)}
						>
							Reset riff
						</button>
					</div>
				</header>
				<textarea
					class="textarea font-tab text-sm"
					rows="6"
					spellcheck="false"
					aria-label="Test riff shorthand"
					aria-invalid={result.errors.length > 0}
					bind:value={soundStore.test.source}></textarea>
				{#if result.errors.length > 0}
					<ul class="space-y-1 card preset-tonal-error p-3 text-sm" aria-live="polite">
						{#each result.errors as error (`${error.line}:${error.column}`)}
							<li class="flex items-start gap-2">
								<CircleAlert class="mt-0.5 size-4 shrink-0" />
								<span><strong>Line {error.line}:</strong> {error.message}</span>
							</li>
						{/each}
					</ul>
				{/if}
				<p class="text-xs opacity-60">
					Same shorthand as the tab editor. Every bar lasts four beats at the BPM below, with its
					notes spread evenly. Hover a section, row or bar to play it; shift+click loops it.
				</p>
				<PlayableTab
					layout={result.layout}
					{tuning}
					placeholder="Write a riff above to try the sound on it."
				/>
			</section>

			<section class="space-y-2 card preset-tonal-surface p-4">
				<h2 class="h5">Test notes</h2>
				<p class="text-xs opacity-60">Each plays for one bar at the current BPM.</p>
				<div class="grid gap-1">
					{#each testNotes.toReversed() as row (row.name)}
						<div class="flex flex-wrap gap-1">
							{#each row.notes as note (note.label)}
								{@const active = player.key === `preview:${note.midi}`}
								<button
									type="button"
									class="btn w-16 font-tab btn-sm {active
										? 'preset-filled-primary-500'
										: 'preset-tonal'}"
									onclick={() => preview(note.label, note.midi)}
								>
									{#if active}<Square class="size-3" />{:else}<Play class="size-3" />{/if}
									{note.label}
								</button>
							{/each}
						</div>
					{/each}
				</div>
			</section>

			<section class="space-y-2 card preset-tonal-surface p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="h5">Settings JSON</h2>
					{#if draft !== null}
						<div class="flex gap-2">
							<button
								type="button"
								class="btn preset-filled-primary-500 btn-sm"
								onclick={applyDraft}
							>
								<Check class="size-4" /> Apply
							</button>
							<button
								type="button"
								class="btn preset-tonal btn-sm"
								onclick={() => ((draft = null), (draftError = ''))}
							>
								Cancel
							</button>
						</div>
					{/if}
				</div>
				<textarea
					class="textarea font-tab text-xs"
					rows="8"
					spellcheck="false"
					aria-label="Sound settings as JSON"
					value={draft ?? json}
					oninput={(e) => (draft = e.currentTarget.value)}></textarea>
				{#if draftError}<p class="text-sm text-error-500">{draftError}</p>{/if}
				<p class="text-xs opacity-60">
					Paste settings here and press Apply to load them. Missing values fall back to the default,
					and out-of-range values are clamped.
				</p>
			</section>
		</div>
	</div>
</div>

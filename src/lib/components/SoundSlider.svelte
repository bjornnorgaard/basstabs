<script lang="ts">
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { DEFAULT_SOUND, type SoundControl } from '$lib/audio/sound';
	import { soundStore } from '$lib/audio/sound-store.svelte';

	let { control }: { control: SoundControl } = $props();

	const STEPS = 1000;
	const id = $derived(`sound-${control.key}`);
	const value = $derived(soundStore.settings[control.key]);
	const defaultValue = $derived(DEFAULT_SOUND[control.key]);
	const modified = $derived(value !== defaultValue);
	const decimals = $derived(Math.max(0, -Math.floor(Math.log10(control.step) + 1e-9)));

	// Log sliders need a positive range, so ranges starting at 0 are shifted up by one.
	const offset = $derived(control.min <= 0 ? 1 : 0);

	function toSlider(v: number) {
		if (!control.log) return v;
		const lo = Math.log(control.min + offset);
		const hi = Math.log(control.max + offset);
		return Math.round(((Math.log(v + offset) - lo) / (hi - lo)) * STEPS);
	}

	function fromSlider(position: number) {
		if (!control.log) return position;
		const lo = control.min + offset;
		const raw = lo * ((control.max + offset) / lo) ** (position / STEPS) - offset;
		return Number((Math.round(raw / control.step) * control.step).toFixed(decimals));
	}

	function set(v: number) {
		if (Number.isFinite(v)) soundStore.set(control.key, v);
	}
</script>

<div class="space-y-1">
	<div class="flex flex-wrap items-center gap-2">
		<label for={id} class="min-w-0 flex-1 text-sm {modified ? 'font-semibold' : ''}">
			{control.label}
		</label>
		<input
			type="number"
			class="input w-24 shrink-0 px-2 py-0.5 text-right font-tab text-xs"
			aria-label="{control.label} value"
			min={control.min}
			max={control.max}
			step={control.step}
			value={Number(value.toFixed(decimals))}
			onchange={(e) => set(e.currentTarget.valueAsNumber)}
		/>
		<span class="w-12 shrink-0 text-xs opacity-60">{control.unit ?? ''}</span>
		<button
			type="button"
			class="btn-icon btn-icon-sm hover:preset-tonal {modified ? '' : 'invisible'}"
			title="Reset to default ({defaultValue}{control.unit ? ` ${control.unit}` : ''})"
			aria-label="Reset {control.label}"
			onclick={() => set(defaultValue)}
		>
			<RotateCcw class="size-3.5" />
		</button>
	</div>
	<input
		{id}
		type="range"
		class="w-full accent-primary-500"
		min={control.log ? 0 : control.min}
		max={control.log ? STEPS : control.max}
		step={control.log ? 1 : control.step}
		value={toSlider(value)}
		oninput={(e) => set(fromSlider(e.currentTarget.valueAsNumber))}
		ondblclick={() => set(defaultValue)}
	/>
	<p class="text-xs leading-snug opacity-60">{control.hint}</p>
</div>

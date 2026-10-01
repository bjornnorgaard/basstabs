import type { Schedule, ScheduledNote } from '$lib/tab/playback';
import { synthesizeBassNote } from './bass';
import { dbToGain, synthKey, type SoundSettings } from './sound';
import { soundStore } from './sound-store.svelte';

const BEATS_PER_BAR = 4;
const LOOKAHEAD_SECONDS = 0.15;
const TICK_MS = 25;
const START_DELAY_SECONDS = 0.05;
/** Time constant used when output settings change mid-playback, to avoid zipper noise. */
const SMOOTHING_SECONDS = 0.03;

export interface PlayOptions {
	/** Identifies what is playing (e.g. `bar:3`) so the UI can mark the active control. */
	key: string;
	/** Human readable description, e.g. "bar 3". */
	label: string;
	/** Loop this playback even when the loop preference is off. */
	loop: boolean;
}

/**
 * Plays schedules through Web Audio. Notes are queued a little ahead of time on the audio
 * clock (so timing stays tight), while an animation frame loop tracks which note is
 * currently audible for highlighting.
 */
class TabPlayer {
	playing = $state(false);
	/** Loop preference, kept between playbacks. */
	loop = $state(false);
	#loopOnce = $state(false);
	/** Whether the current playback loops, either by preference or for this playback only. */
	looping = $derived(this.loop || this.#loopOnce);
	bpm = $state(100);
	key = $state<string | null>(null);
	label = $state('');
	activeNoteId = $state<number | null>(null);
	activeMeasureId = $state<number | null>(null);

	#ctx?: AudioContext;
	#bus?: Bus;
	/** The note currently sounding. A bass line is one note at a time, so a new note mutes it. */
	#voice?: { gain: GainNode; source: AudioBufferSourceNode };
	/** Synthesised takes per MIDI note, valid for the synth settings in `#buffersKey`. */
	#buffers = new Map<number, AudioBuffer[]>();
	#buffersKey = '';
	#schedule: Schedule = { notes: [], length: 0 };
	#nextIndex = 0;
	#iteration = 0;
	#endBars = Infinity;
	#anchorTime = 0;
	#anchorBars = 0;
	#barSeconds = 0;
	#timer?: ReturnType<typeof setInterval>;
	#frame?: number;

	async play(schedule: Schedule, options: PlayOptions) {
		this.stop();
		if (schedule.notes.length === 0) return;

		const ctx = (this.#ctx ??= new AudioContext());
		if (ctx.state !== 'running') await ctx.resume();

		this.#bus = createBus(ctx, soundStore.active);

		for (const note of schedule.notes) this.#takes(note.midi);

		this.#schedule = schedule;
		this.#nextIndex = 0;
		this.#iteration = 0;
		this.#endBars = Infinity;
		this.#barSeconds = (BEATS_PER_BAR * 60) / this.bpm;
		this.#anchorTime = ctx.currentTime + START_DELAY_SECONDS;
		this.#anchorBars = 0;

		this.#loopOnce = options.loop;
		this.key = options.key;
		this.label = options.label;
		this.playing = true;

		this.#tick();
		this.#timer = setInterval(() => this.#tick(), TICK_MS);
		this.#frame = requestAnimationFrame(() => this.#update());
	}

	stop() {
		clearInterval(this.#timer);
		if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
		this.#timer = this.#frame = undefined;

		const ctx = this.#ctx;
		const master = this.#bus?.master;
		if (ctx && master) {
			master.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
			setTimeout(() => master.disconnect(), 100);
		}
		this.#bus = this.#voice = undefined;

		this.playing = false;
		this.#loopOnce = false;
		this.key = null;
		this.label = '';
		this.activeNoteId = null;
		this.activeMeasureId = null;
	}

	toggleLoop() {
		const next = !this.looping;
		this.#loopOnce = false;
		this.loop = next;
	}

	/** Plays a single note for one bar, to try out the sound. */
	preview(midi: number, label: string) {
		const note = { noteId: -1, measureId: -1, midi, start: 0, length: 1 };
		return this.play({ notes: [note], length: 1 }, { key: `preview:${midi}`, label, loop: false });
	}

	/** Changes tempo, keeping the current playback position. */
	setBpm(bpm: number) {
		if (!Number.isFinite(bpm) || bpm <= 0) return;
		if (this.playing && this.#ctx) {
			const now = this.#ctx.currentTime;
			this.#anchorBars = this.#barsAt(now);
			this.#anchorTime = now;
			this.#barSeconds = (BEATS_PER_BAR * 60) / bpm;
		}
		this.bpm = bpm;
	}

	#barsAt(time: number) {
		return this.#anchorBars + (time - this.#anchorTime) / this.#barSeconds;
	}

	#timeAt(bars: number) {
		return this.#anchorTime + (bars - this.#anchorBars) * this.#barSeconds;
	}

	#tick() {
		const ctx = this.#ctx;
		if (!ctx) return;
		const { notes, length } = this.#schedule;
		const horizon = ctx.currentTime + LOOKAHEAD_SECONDS;
		this.#applyOutputSettings();

		while (true) {
			if (this.#nextIndex >= notes.length) {
				if (!this.looping) {
					this.#endBars = (this.#iteration + 1) * length;
					return;
				}
				this.#iteration++;
				this.#nextIndex = 0;
				this.#endBars = Infinity;
			}
			const note = notes[this.#nextIndex];
			const time = this.#timeAt(this.#iteration * length + note.start);
			if (time > horizon) return;
			this.#playNote(note, Math.max(time, ctx.currentTime), note.length * this.#barSeconds);
			this.#nextIndex++;
		}
	}

	#applyOutputSettings() {
		const ctx = this.#ctx;
		if (ctx && this.#bus) updateBus(this.#bus, soundStore.active, ctx.currentTime);
	}

	/** Returns the synthesised takes of a note, building them if the settings changed. */
	#takes(midi: number): AudioBuffer[] | undefined {
		const ctx = this.#ctx;
		if (!ctx) return undefined;
		const settings = soundStore.active;
		const pitch = midi + settings.transpose;
		const key = synthKey(settings);
		if (key !== this.#buffersKey) {
			this.#buffers.clear();
			this.#buffersKey = key;
		}
		let takes = this.#buffers.get(pitch);
		if (!takes) {
			takes = Array.from({ length: settings.roundRobin }, () => {
				const samples = synthesizeBassNote(pitch, ctx.sampleRate, settings);
				const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
				buffer.copyToChannel(samples, 0);
				return buffer;
			});
			this.#buffers.set(pitch, takes);
		}
		return takes;
	}

	#playNote(note: ScheduledNote, time: number, duration: number) {
		const ctx = this.#ctx;
		const takes = this.#takes(note.midi);
		const input = this.#bus?.input;
		if (!ctx || !takes || !input) return;
		const settings = soundStore.active;
		const release = settings.releaseMs / 1000;
		const jitter = (Math.random() * 2 - 1) * (settings.timingJitterMs / 1000);
		const start = Math.max(ctx.currentTime, time + jitter);
		const end = time + duration * settings.gate;

		// Re-plucking stops the previous note, so mute it instead of letting the two overlap
		// (two copies of the same pitch slightly out of phase sound smeared and phasey).
		const previous = this.#voice;
		if (previous) {
			previous.gain.gain.cancelScheduledValues(start);
			previous.gain.gain.setTargetAtTime(0, start, settings.chokeMs / 1000);
			previous.source.stop(start + (settings.chokeMs / 1000) * 8);
		}

		// Lean on the first note of each bar and vary the rest a little, as a player would.
		const accent = Number.isInteger(note.start) ? 1 : 1 - settings.accent;
		const velocity = accent * (1 - Math.random() * settings.velocityRandom);

		const source = ctx.createBufferSource();
		source.buffer = takes[Math.floor(Math.random() * takes.length)];
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(velocity, start);
		gain.gain.setTargetAtTime(0, Math.max(start, end), release);
		source.connect(gain).connect(input);
		source.start(start);
		source.stop(Math.max(start, end) + release * 8);
		this.#voice = { gain, source };
	}

	#update() {
		const ctx = this.#ctx;
		if (!ctx || !this.playing) return;
		const latency = ctx.outputLatency || ctx.baseLatency || 0;
		const position = this.#barsAt(ctx.currentTime - latency);

		if (position >= this.#endBars) {
			this.stop();
			return;
		}

		const { notes, length } = this.#schedule;
		const local = position < 0 ? -1 : position % length;
		const active = notes.find((n) => local >= n.start && local < n.start + n.length);
		this.activeNoteId = active?.noteId ?? null;
		this.activeMeasureId = active?.measureId ?? null;
		this.#frame = requestAnimationFrame(() => this.#update());
	}
}

interface Bus {
	input: AudioNode;
	highpass: BiquadFilterNode;
	mid: BiquadFilterNode;
	lowpass: BiquadFilterNode;
	compressor: DynamicsCompressorNode;
	master: GainNode;
}

/** The shared signal chain after the voices: EQ, compressor and master gain. */
function createBus(ctx: AudioContext, settings: SoundSettings): Bus {
	const highpass = ctx.createBiquadFilter();
	highpass.type = 'highpass';
	const mid = ctx.createBiquadFilter();
	mid.type = 'peaking';
	const lowpass = ctx.createBiquadFilter();
	lowpass.type = 'lowpass';
	const compressor = ctx.createDynamicsCompressor();
	compressor.knee.value = 6;
	const master = ctx.createGain();
	highpass
		.connect(mid)
		.connect(lowpass)
		.connect(compressor)
		.connect(master)
		.connect(ctx.destination);
	const bus = { input: highpass, highpass, mid, lowpass, compressor, master };
	updateBus(bus, settings);
	return bus;
}

/** Moves the bus to the given settings, gliding when `time` is given to avoid zipper noise. */
function updateBus(bus: Bus, settings: SoundSettings, time?: number) {
	const set = (param: AudioParam, value: number) => {
		if (param.value === value) return;
		if (time === undefined) param.value = value;
		else param.setTargetAtTime(value, time, SMOOTHING_SECONDS);
	};
	set(bus.highpass.frequency, settings.highpassHz);
	// Web Audio takes low/high-pass resonance in dB (20·log10 of the linear Q).
	set(bus.highpass.Q, 20 * Math.log10(Math.SQRT1_2));
	set(bus.mid.frequency, settings.midHz);
	set(bus.mid.gain, settings.midGainDb);
	set(bus.mid.Q, settings.midQ);
	set(bus.lowpass.frequency, settings.lowpassHz);
	set(bus.lowpass.Q, 20 * Math.log10(settings.lowpassQ));
	set(bus.compressor.threshold, settings.compThresholdDb);
	set(bus.compressor.ratio, settings.compRatio);
	set(bus.compressor.attack, settings.compAttackMs / 1000);
	set(bus.compressor.release, settings.compReleaseMs / 1000);
	set(bus.master.gain, dbToGain(settings.volumeDb));
}

export const player = new TabPlayer();

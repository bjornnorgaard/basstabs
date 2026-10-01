import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '$lib/tab/playback';
import { synthesizeBassNote } from './bass';
import {
	CLEAN_SOUND,
	DEFAULT_SOUND,
	normalizeSoundSettings,
	SOUND_CONTROLS,
	synthKey
} from './sound';

const SAMPLE_RATE = 48000;

function seeded(seed: number) {
	return () => {
		seed = (seed * 1664525 + 1013904223) % 2 ** 32;
		return seed / 2 ** 32;
	};
}

/**
 * Measures pitch from how far the phase of the expected frequency moves between two
 * windows. Unlike autocorrelation it stays accurate for the lowest notes.
 */
function estimateFrequency(samples: Float32Array, expected: number) {
	const size = Math.floor(0.2 * SAMPLE_RATE);
	const phase = (from: number) => {
		let re = 0;
		let im = 0;
		for (let i = 0; i < size; i++) {
			const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
			const angle = (2 * Math.PI * expected * (from + i)) / SAMPLE_RATE;
			re += window * samples[from + i] * Math.cos(angle);
			im -= window * samples[from + i] * Math.sin(angle);
		}
		return Math.atan2(im, re);
	};
	const [a, b] = [Math.floor(0.3 * SAMPLE_RATE), Math.floor(0.6 * SAMPLE_RATE)];
	let drift = phase(b) - phase(a);
	drift -= 2 * Math.PI * Math.round(drift / (2 * Math.PI));
	return expected + drift / ((2 * Math.PI * (b - a)) / SAMPLE_RATE);
}

const cents = (actual: number, expected: number) => 1200 * Math.log2(actual / expected);
const rms = (samples: Float32Array, from: number, to: number) => {
	let sum = 0;
	for (let i = from; i < to; i++) sum += samples[i] ** 2;
	return Math.sqrt(sum / (to - from));
};

describe('synthesizeBassNote', () => {
	it.each([23, 28, 33, 40, 45, 55, 62])('is in tune for MIDI note %i', (midi) => {
		const samples = synthesizeBassNote(midi, SAMPLE_RATE, DEFAULT_SOUND, seeded(midi));
		const expected = midiToFrequency(midi);
		expect(Math.abs(cents(estimateFrequency(samples, expected), expected))).toBeLessThan(2);
	});

	it('has a pitch check that notices a note 5 cents out', () => {
		const samples = synthesizeBassNote(28, SAMPLE_RATE, DEFAULT_SOUND, seeded(5));
		const wrong = midiToFrequency(28.05);
		const error = cents(estimateFrequency(samples, wrong), wrong);
		expect(error).toBeGreaterThan(-6.5);
		expect(error).toBeLessThan(-4);
	});

	it('produces a bounded signal that starts silent and fades away', () => {
		const samples = synthesizeBassNote(28, SAMPLE_RATE, DEFAULT_SOUND, seeded(1));
		const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);

		expect(samples.every(Number.isFinite)).toBe(true);
		expect(peak).toBeCloseTo(0.6, 5);
		expect(Math.abs(samples[0])).toBe(0);
		expect(samples[samples.length - 1]).toBeCloseTo(0, 3);
		expect(rms(samples, SAMPLE_RATE * 2, SAMPLE_RATE * 2.5)).toBeLessThan(
			rms(samples, 0, SAMPLE_RATE * 0.5) / 4
		);
	});

	it('varies slightly between notes', () => {
		const a = synthesizeBassNote(33, SAMPLE_RATE, DEFAULT_SOUND, seeded(1));
		const b = synthesizeBassNote(33, SAMPLE_RATE, DEFAULT_SOUND, seeded(2));
		expect(a).not.toEqual(b);
	});

	it.each([28, 43, 60])('stays in tune with the clean preset for MIDI note %i', (midi) => {
		const samples = synthesizeBassNote(midi, SAMPLE_RATE, CLEAN_SOUND, seeded(midi));
		const expected = midiToFrequency(midi);
		expect(Math.abs(cents(estimateFrequency(samples, expected), expected))).toBeLessThan(2);
	});

	it.each([
		['stiffness', { stiffness: 1 }],
		['a pickup comb', { pickupPosition: 0.2 }],
		['a soft exciter', { exciterCutoff: 300 }],
		['everything at once', { stiffness: 0.6, pickupPosition: 0.15, exciterCutoff: 1000, drive: 3 }]
	])('stays in tune with %s', (_, overrides) => {
		for (const midi of [28, 45, 67]) {
			const samples = synthesizeBassNote(midi, SAMPLE_RATE, { ...CLEAN_SOUND, ...overrides });
			const expected = midiToFrequency(midi);
			expect(Math.abs(cents(estimateFrequency(samples, expected), expected))).toBeLessThan(2);
		}
	});

	it('stays finite and bounded at the extremes of every control', () => {
		for (const control of SOUND_CONTROLS) {
			for (const value of [control.min, control.max]) {
				const settings = { ...DEFAULT_SOUND, [control.key]: value };
				for (const midi of [23, 60]) {
					const samples = synthesizeBassNote(midi, 8000, settings, seeded(3));
					const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
					expect(samples.every(Number.isFinite), `${control.key}=${value}`).toBe(true);
					expect(peak, `${control.key}=${value}`).toBeLessThanOrEqual(0.6 + 1e-6);
				}
			}
		}
	});
});

describe('sound settings', () => {
	it('fills in defaults, clamps values and drops unknown or invalid keys', () => {
		const settings = normalizeSoundSettings({
			drive: 99,
			volumeDb: -100,
			roundRobin: 2.6,
			damping: 'bright',
			decay: Number.NaN,
			somethingElse: 1
		});
		expect(settings).toEqual({ ...DEFAULT_SOUND, drive: 10, volumeDb: -48, roundRobin: 3 });
	});

	it('falls back to defaults for anything that is not an object', () => {
		expect(normalizeSoundSettings(null)).toEqual(DEFAULT_SOUND);
		expect(normalizeSoundSettings('{}')).toEqual(DEFAULT_SOUND);
	});

	it('has a control for every setting, and defaults within range', () => {
		expect(SOUND_CONTROLS.map((c) => c.key).sort()).toEqual(Object.keys(DEFAULT_SOUND).sort());
		expect(normalizeSoundSettings(DEFAULT_SOUND)).toEqual(DEFAULT_SOUND);
		expect(normalizeSoundSettings(CLEAN_SOUND)).toEqual(CLEAN_SOUND);
	});

	it('only changes the synth key for settings that change the samples', () => {
		const key = synthKey(DEFAULT_SOUND);
		expect(synthKey({ ...DEFAULT_SOUND, volumeDb: -20, releaseMs: 5, transpose: 12 })).toBe(key);
		expect(synthKey({ ...DEFAULT_SOUND, drive: 0 })).not.toBe(key);
	});
});

import { midiToFrequency } from '../tab/playback';
import { DEFAULT_SOUND, type SoundSettings } from './sound';

const PEAK = 0.6;
const MAX_SECONDS = 6;
const TAIL_SECONDS = 0.15;
const LOW_E = 41.2;
const DISPERSION_STAGES = 4;
/** The exciter low-pass is bypassed at the top of its range. */
const EXCITER_BYPASS_HZ = 19999;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** T60 of the string for a given fundamental. */
function stringT60(f0: number, settings: SoundSettings) {
	return settings.decay * (LOW_E / f0) ** settings.decayTracking;
}

/** How long a note's samples need to be before it has faded to silence. */
export function noteSeconds(midi: number, settings: SoundSettings): number {
	const string = settings.stringLevel > 0 ? stringT60(midiToFrequency(midi), settings) : 0;
	const sine = settings.sineLevel > 0 ? settings.sineDecay * 7 : 0;
	return clamp(Math.max(string, sine) + TAIL_SECONDS, 0.3, MAX_SECONDS);
}

/** Phase delay, in samples, of a first-order all-pass `(c + z⁻¹) / (1 + c·z⁻¹)` at `w` rad/sample. */
function allpassPhaseDelay(c: number, w: number) {
	const re = c + Math.cos(w);
	const im = -Math.sin(w);
	const dRe = 1 + c * Math.cos(w);
	const dIm = -c * Math.sin(w);
	return -(Math.atan2(im, re) - Math.atan2(dIm, dRe)) / w;
}

/**
 * Synthesises one bass note as raw samples.
 *
 * An extended Karplus–Strong model: the delay line is loaded with the triangle shape of a
 * string pulled aside at the pluck point, then circulates through a one-pole damping
 * filter, an optional chain of all-pass filters for stiffness, and a fractional all-pass
 * that tunes the loop to a fraction of a sample. All filter delays at the fundamental are
 * subtracted from the line length, so the note stays in tune whatever the settings. The
 * output passes an optional pickup comb, is mixed with a decaying sine and soft-clipped.
 */
export function synthesizeBassNote(
	midi: number,
	sampleRate: number,
	settings: SoundSettings = DEFAULT_SOUND,
	random: () => number = Math.random
): Float32Array<ArrayBuffer> {
	const f0 = midiToFrequency(midi);
	const length = Math.floor(sampleRate * noteSeconds(midi, settings));
	const w0 = (2 * Math.PI * f0) / sampleRate;
	const period = sampleRate / f0;

	const a = clamp(
		settings.damping + settings.dampingTracking * clamp((f0 - 40) / 160, 0, 1),
		0.02,
		0.99
	);
	const pole = 1 - a;
	const dampingDelay = Math.atan2(pole * Math.sin(w0), 1 - pole * Math.cos(w0)) / w0;
	const dampingGain = a / Math.hypot(1 - pole * Math.cos(w0), pole * Math.sin(w0));

	// Dispersion can add a lot of delay; keep it to a fraction of the period on high notes.
	let c = -0.9 * settings.stiffness;
	const dispersionDelay = () => DISPERSION_STAGES * allpassPhaseDelay(c, w0);
	while (c < 0 && dispersionDelay() > 0.4 * period) c *= 0.8;
	const stiffnessDelay = c < 0 ? dispersionDelay() : 0;

	// Whole samples go in the delay line; the remainder (kept in [0.1, 1.1) for a
	// well-behaved all-pass) is handled by the tuning all-pass.
	const target = period - dampingDelay - stiffnessDelay;
	const size = Math.max(2, Math.floor(target - 0.1));
	const fraction = target - size;
	const tuning = (1 - fraction) / (1 + fraction);
	const loopGain = Math.min(0.99995, 10 ** (-3 / (f0 * stringT60(f0, settings))) / dampingGain);

	// Initial displacement: a triangle peaked at the pluck point, plus noise, optionally low-passed.
	const line = new Float32Array(size);
	const peakAt = clamp(Math.round(size * settings.pluckPosition), 1, size - 1);
	for (let i = 0; i < size; i++) {
		const shape = i < peakAt ? i / peakAt : (size - i) / (size - peakAt);
		line[i] = shape + settings.exciterNoise * (random() * 2 - 1);
	}
	if (settings.exciterCutoff < EXCITER_BYPASS_HZ) {
		// The line holds one period, so filter it circularly (twice round to settle).
		const k = 1 - Math.exp((-2 * Math.PI * settings.exciterCutoff) / sampleRate);
		let state = line[size - 1];
		for (let pass = 0; pass < 2; pass++) {
			for (let i = 0; i < size; i++) {
				state += k * (line[i] - state);
				if (pass === 1) line[i] = state;
			}
		}
	}
	const mean = line.reduce((sum, v) => sum + v, 0) / size;
	for (let i = 0; i < size; i++) line[i] -= mean;

	const string = new Float32Array(length);
	const stageIn = new Float64Array(DISPERSION_STAGES);
	const stageOut = new Float64Array(DISPERSION_STAGES);
	let index = 0;
	let lowpass = 0;
	let tuneIn = 0;
	let tuneOut = 0;
	for (let i = 0; i < length; i++) {
		const sample = line[index];
		string[i] = sample;
		lowpass = a * sample + pole * lowpass;
		let v = lowpass;
		if (c < 0) {
			for (let s = 0; s < DISPERSION_STAGES; s++) {
				const out = c * v + stageIn[s] - c * stageOut[s];
				stageIn[s] = v;
				stageOut[s] = out;
				v = out;
			}
		}
		tuneOut = tuning * v + tuneIn - tuning * tuneOut;
		tuneIn = v;
		line[index] = loopGain * tuneOut;
		index = (index + 1) % size;
	}

	// Pickup: the string is sensed at a point, which acts as a feed-forward comb.
	let stringPeak = 0;
	const pickupDelay = Math.round(settings.pickupPosition * period);
	if (pickupDelay >= 1) {
		for (let i = length - 1; i >= 0; i--) {
			string[i] -= i >= pickupDelay ? string[i - pickupDelay] : 0;
		}
	}
	for (let i = 0; i < length; i++) stringPeak = Math.max(stringPeak, Math.abs(string[i]));

	// Mix in the sine layer, then block DC with a 5 Hz high-pass (well below B0 at 31 Hz).
	const out = new Float32Array(length);
	const stringScale = settings.stringLevel / (stringPeak || 1);
	const wSine = w0 * 2 ** settings.sineOctave;
	const dcPole = 1 - (2 * Math.PI * 5) / sampleRate;
	let dcIn = 0;
	let dcOut = 0;
	let peak = 0;
	for (let i = 0; i < length; i++) {
		const t = i / sampleRate;
		const sine = settings.sineLevel * Math.sin(wSine * i) * Math.exp(-t / settings.sineDecay);
		const mixed = string[i] * stringScale + sine;
		dcOut = mixed - dcIn + dcPole * dcOut;
		dcIn = mixed;
		out[i] = dcOut;
		peak = Math.max(peak, Math.abs(dcOut));
	}
	if (peak === 0) return out;

	const drive = settings.drive;
	const saturate =
		drive > 0.01 ? (v: number) => Math.tanh(drive * v) / Math.tanh(drive) : (v: number) => v;
	const attack = (settings.attackMs / 1000) * sampleRate;
	const tail = Math.min(length / 2, TAIL_SECONDS * sampleRate);
	let finalPeak = 0;
	for (let i = 0; i < length; i++) {
		let v = saturate(out[i] / peak);
		if (i < attack) v *= i / attack;
		if (i > length - tail) v *= (length - i) / tail;
		out[i] = v;
		finalPeak = Math.max(finalPeak, Math.abs(v));
	}
	if (finalPeak > 0) for (let i = 0; i < length; i++) out[i] *= PEAK / finalPeak;
	return out;
}

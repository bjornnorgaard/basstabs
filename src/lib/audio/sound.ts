/**
 * Every parameter that shapes playback. Keys are part of the JSON people copy and share, so
 * renaming one drops it from saved and shared settings (it falls back to its default).
 */
export interface SoundSettings {
	// Exciter
	pluckPosition: number;
	exciterCutoff: number;
	exciterNoise: number;
	// String model
	damping: number;
	dampingTracking: number;
	decay: number;
	decayTracking: number;
	stiffness: number;
	pickupPosition: number;
	stringLevel: number;
	// Sine layer
	sineLevel: number;
	sineDecay: number;
	sineOctave: number;
	// Saturation and amp envelope
	drive: number;
	attackMs: number;
	gate: number;
	releaseMs: number;
	chokeMs: number;
	// EQ
	highpassHz: number;
	midHz: number;
	midGainDb: number;
	midQ: number;
	lowpassHz: number;
	lowpassQ: number;
	// Dynamics
	compThresholdDb: number;
	compRatio: number;
	compAttackMs: number;
	compReleaseMs: number;
	// Humanise
	timingJitterMs: number;
	velocityRandom: number;
	accent: number;
	roundRobin: number;
	// Output
	transpose: number;
	volumeDb: number;
}

export const DEFAULT_SOUND: SoundSettings = {
	pluckPosition: 0.25,
	exciterCutoff: 3500,
	exciterNoise: 0.1,
	damping: 0.25,
	dampingTracking: 0.25,
	decay: 3.2,
	decayTracking: 0.45,
	stiffness: 0,
	pickupPosition: 0,
	stringLevel: 1,
	sineLevel: 0.8,
	sineDecay: 0.35,
	sineOctave: 0,
	drive: 1.5,
	attackMs: 4,
	gate: 1,
	releaseMs: 20,
	chokeMs: 10,
	highpassHz: 10,
	midHz: 800,
	midGainDb: 0,
	midQ: 1,
	lowpassHz: 4000,
	lowpassQ: 0.5,
	compThresholdDb: 0,
	compRatio: 1,
	compAttackMs: 10,
	compReleaseMs: 150,
	timingJitterMs: 6,
	velocityRandom: 0.12,
	accent: 0,
	roundRobin: 3,
	transpose: 0,
	volumeDb: -3
};

/** A neutral baseline: no saturation, exciter noise or humanising, to hear the bare model. */
export const CLEAN_SOUND: SoundSettings = {
	...DEFAULT_SOUND,
	exciterNoise: 0,
	drive: 0,
	timingJitterMs: 0,
	velocityRandom: 0,
	accent: 0,
	roundRobin: 1
};

export const SOUND_GROUPS = [
	{
		id: 'exciter',
		title: 'Exciter',
		description: 'The initial displacement that is loaded into the string when a note is plucked.'
	},
	{
		id: 'string',
		title: 'String model',
		description:
			'Extended Karplus–Strong waveguide: a delay line tuned to the note, with a one-pole damping filter, optional all-pass dispersion and a pickup comb.'
	},
	{
		id: 'sine',
		title: 'Sine layer',
		description: 'A decaying sine mixed under the string for weight in the fundamental.'
	},
	{
		id: 'envelope',
		title: 'Saturation & amp envelope',
		description: 'Per-note waveshaping and how notes start, end and hand over to each other.'
	},
	{
		id: 'eq',
		title: 'EQ',
		description: 'Bus filters after the voices, in series: high-pass → peaking mid → low-pass.'
	},
	{
		id: 'dynamics',
		title: 'Compressor',
		description:
			'Bus compressor after the EQ (Web Audio DynamicsCompressor, 6 dB knee, automatic make-up gain). Ratio 1:1 bypasses it.'
	},
	{
		id: 'humanise',
		title: 'Humanise',
		description: 'Random variation so repeated notes don’t sound machine-gunned.'
	},
	{ id: 'output', title: 'Output', description: 'Pitch and level of the whole instrument.' }
] as const;

export type SoundGroupId = (typeof SOUND_GROUPS)[number]['id'];

export interface SoundControl {
	key: keyof SoundSettings;
	label: string;
	group: SoundGroupId;
	min: number;
	max: number;
	step: number;
	/** Map the slider logarithmically, for frequencies and times spanning decades. */
	log?: boolean;
	unit?: string;
	hint: string;
}

export const SOUND_CONTROLS: SoundControl[] = [
	{
		key: 'pluckPosition',
		label: 'Pluck position',
		group: 'exciter',
		min: 0.02,
		max: 0.5,
		step: 0.01,
		unit: '× scale',
		hint: 'Excitation point as a fraction of scale length from the bridge. Notches every harmonic n where n × position is a whole number: 0.5 cancels even harmonics (hollow), close to the bridge is thin and nasal.'
	},
	{
		key: 'exciterCutoff',
		label: 'Exciter low-pass',
		group: 'exciter',
		min: 100,
		max: 20000,
		step: 1,
		log: true,
		unit: 'Hz',
		hint: 'One-pole low-pass on the initial displacement. Low = soft fingertip, high = pick or slap. 20 kHz bypasses it.'
	},
	{
		key: 'exciterNoise',
		label: 'Exciter noise',
		group: 'exciter',
		min: 0,
		max: 1,
		step: 0.01,
		hint: 'White noise added to the displacement, relative to its peak. Adds scratch to the transient and makes round-robin takes differ.'
	},
	{
		key: 'damping',
		label: 'Loop damping',
		group: 'string',
		min: 0.02,
		max: 0.99,
		step: 0.01,
		hint: 'Coefficient of the one-pole low-pass in the feedback loop (1 = no filtering). Low values kill upper partials fast (dead, flatwound); high values let them ring (fresh roundwound).'
	},
	{
		key: 'dampingTracking',
		label: 'Damping key-tracking',
		group: 'string',
		min: 0,
		max: 1,
		step: 0.01,
		hint: 'Opens the loop filter for higher notes (added linearly from 40 Hz to 200 Hz fundamentals) so the upper register keeps its harmonics.'
	},
	{
		key: 'decay',
		label: 'Decay T60 at E1',
		group: 'string',
		min: 0.2,
		max: 15,
		step: 0.05,
		log: true,
		unit: 's',
		hint: 'Time for the fundamental of low E (41.2 Hz) to fall by 60 dB. Notes are muted at the end of their gate anyway; voices are capped at 6 s.'
	},
	{
		key: 'decayTracking',
		label: 'Decay key-tracking',
		group: 'string',
		min: 0,
		max: 1.5,
		step: 0.01,
		hint: 'T60 scales with (41.2 Hz / f₀)^k. 0 = every note rings equally long, 1 = decay halves per octave.'
	},
	{
		key: 'stiffness',
		label: 'Stiffness (inharmonicity)',
		group: 'string',
		min: 0,
		max: 1,
		step: 0.01,
		hint: 'All-pass dispersion in the loop (4 first-order stages) that stretches upper partials sharp, like a stiff wound string. The fundamental stays in tune. Pulled back automatically on high notes.'
	},
	{
		key: 'pickupPosition',
		label: 'Pickup position',
		group: 'string',
		min: 0,
		max: 0.5,
		step: 0.01,
		unit: '× scale',
		hint: 'Feed-forward comb simulating a magnetic pickup at this fraction of the scale length from the bridge. 0 bypasses it. ~0.1 is a bridge pickup (thin, punchy, more mids), ~0.25 a neck pickup (fat, scooped).'
	},
	{
		key: 'stringLevel',
		label: 'String level',
		group: 'string',
		min: 0,
		max: 1,
		step: 0.01,
		hint: 'Level of the waveguide before it is summed with the sine layer. Each voice is peak-normalised afterwards, so this sets the balance.'
	},
	{
		key: 'sineLevel',
		label: 'Sine level',
		group: 'sine',
		min: 0,
		max: 1,
		step: 0.01,
		hint: 'Level of the sine relative to the string (whose peak is 1).'
	},
	{
		key: 'sineDecay',
		label: 'Sine decay τ',
		group: 'sine',
		min: 0.02,
		max: 5,
		step: 0.01,
		log: true,
		unit: 's',
		hint: 'Exponential time constant of the sine (time to fall to 37 %, about −8.7 dB).'
	},
	{
		key: 'sineOctave',
		label: 'Sine octave',
		group: 'sine',
		min: -1,
		max: 1,
		step: 1,
		hint: '−1 puts the sine an octave below the note (sub), +1 an octave above.'
	},
	{
		key: 'drive',
		label: 'Drive',
		group: 'envelope',
		min: 0,
		max: 10,
		step: 0.05,
		hint: 'tanh waveshaper per voice, normalised so the peak level is unchanged. 0 is linear; about 1–2 is warm and compressed; higher adds odd harmonics and grit.'
	},
	{
		key: 'attackMs',
		label: 'Attack',
		group: 'envelope',
		min: 0,
		max: 200,
		step: 0.5,
		log: true,
		unit: 'ms',
		hint: 'Linear fade-in at note start. A few ms removes the click; longer swells the note in.'
	},
	{
		key: 'gate',
		label: 'Gate length',
		group: 'envelope',
		min: 0.05,
		max: 1,
		step: 0.01,
		unit: '× slot',
		hint: 'Fraction of its rhythmic slot a note sounds before release starts. 1 = legato, around 0.5 = staccato or palm-muted.'
	},
	{
		key: 'releaseMs',
		label: 'Release τ',
		group: 'envelope',
		min: 1,
		max: 2000,
		step: 1,
		log: true,
		unit: 'ms',
		hint: 'Exponential time constant of the fade after the gate closes. Very short can click; long lets notes overlap.'
	},
	{
		key: 'chokeMs',
		label: 'Choke τ',
		group: 'envelope',
		min: 1,
		max: 1000,
		step: 1,
		log: true,
		unit: 'ms',
		hint: 'How fast a sounding note is muted when the next one starts, as on a real string that is re-plucked or fretted. High values let notes overlap (beating on repeated pitches).'
	},
	{
		key: 'highpassHz',
		label: 'High-pass',
		group: 'eq',
		min: 10,
		max: 1000,
		step: 1,
		log: true,
		unit: 'Hz',
		hint: '12 dB/oct Butterworth. Low E is 41 Hz and a 5-string B is 31 Hz.'
	},
	{
		key: 'midHz',
		label: 'Mid frequency',
		group: 'eq',
		min: 40,
		max: 8000,
		step: 1,
		log: true,
		unit: 'Hz',
		hint: 'Centre of the peaking band.'
	},
	{
		key: 'midGainDb',
		label: 'Mid gain',
		group: 'eq',
		min: -24,
		max: 24,
		step: 0.5,
		unit: 'dB',
		hint: 'Boost or cut of the peaking band. 0 bypasses it.'
	},
	{
		key: 'midQ',
		label: 'Mid Q',
		group: 'eq',
		min: 0.1,
		max: 12,
		step: 0.05,
		log: true,
		hint: 'Bandwidth of the peaking band; higher is narrower.'
	},
	{
		key: 'lowpassHz',
		label: 'Low-pass',
		group: 'eq',
		min: 100,
		max: 20000,
		step: 1,
		log: true,
		unit: 'Hz',
		hint: '12 dB/oct resonant low-pass.'
	},
	{
		key: 'lowpassQ',
		label: 'Low-pass Q',
		group: 'eq',
		min: 0.1,
		max: 20,
		step: 0.05,
		log: true,
		hint: 'Resonance of the low-pass. 0.707 is Butterworth (flat); higher adds a peak at the cut-off.'
	},
	{
		key: 'compThresholdDb',
		label: 'Threshold',
		group: 'dynamics',
		min: -60,
		max: 0,
		step: 0.5,
		unit: 'dBFS',
		hint: 'Level above which gain reduction starts.'
	},
	{
		key: 'compRatio',
		label: 'Ratio',
		group: 'dynamics',
		min: 1,
		max: 20,
		step: 0.1,
		log: true,
		unit: ': 1',
		hint: 'Input-to-output ratio above the threshold. 1 bypasses the compressor.'
	},
	{
		key: 'compAttackMs',
		label: 'Attack',
		group: 'dynamics',
		min: 0.1,
		max: 200,
		step: 0.1,
		log: true,
		unit: 'ms',
		hint: 'Time to reduce gain by 10 dB. Slow attack lets the pluck through.'
	},
	{
		key: 'compReleaseMs',
		label: 'Release',
		group: 'dynamics',
		min: 10,
		max: 1000,
		step: 1,
		log: true,
		unit: 'ms',
		hint: 'Time to recover 10 dB of gain.'
	},
	{
		key: 'timingJitterMs',
		label: 'Timing jitter',
		group: 'humanise',
		min: 0,
		max: 50,
		step: 0.5,
		unit: '± ms',
		hint: 'Uniform random offset of each note onset.'
	},
	{
		key: 'velocityRandom',
		label: 'Velocity random',
		group: 'humanise',
		min: 0,
		max: 1,
		step: 0.01,
		hint: 'Each note’s gain is reduced by a random fraction up to this value.'
	},
	{
		key: 'accent',
		label: 'Downbeat accent',
		group: 'humanise',
		min: 0,
		max: 1,
		step: 0.01,
		hint: 'Gain reduction for every note except the first in its bar.'
	},
	{
		key: 'roundRobin',
		label: 'Round-robin takes',
		group: 'humanise',
		min: 1,
		max: 6,
		step: 1,
		hint: 'Separately synthesised takes per pitch, picked at random. They only differ when exciter noise is above 0.'
	},
	{
		key: 'transpose',
		label: 'Transpose',
		group: 'output',
		min: -24,
		max: 24,
		step: 1,
		unit: 'st',
		hint: 'Shifts all notes in semitones. Standard 4-string open strings are E1 A1 D2 G2 (41–98 Hz).'
	},
	{
		key: 'volumeDb',
		label: 'Master',
		group: 'output',
		min: -48,
		max: 6,
		step: 0.5,
		unit: 'dB',
		hint: 'Output gain. Each voice peaks at about −4.4 dBFS before the bus.'
	}
];

/** Settings baked into the synthesised samples; the rest are applied live on the audio bus. */
const SYNTH_KEYS = [
	'pluckPosition',
	'exciterCutoff',
	'exciterNoise',
	'damping',
	'dampingTracking',
	'decay',
	'decayTracking',
	'stiffness',
	'pickupPosition',
	'stringLevel',
	'sineLevel',
	'sineDecay',
	'sineOctave',
	'drive',
	'attackMs',
	'roundRobin'
] as const satisfies (keyof SoundSettings)[];

/** Identifies a set of synthesised samples, so cached notes can be thrown away when it changes. */
export function synthKey(settings: SoundSettings): string {
	return SYNTH_KEYS.map((key) => settings[key]).join('|');
}

/** Fills in missing values with defaults, clamps everything to its control's range and drops unknown keys. */
export function normalizeSoundSettings(input: unknown): SoundSettings {
	const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	const result = { ...DEFAULT_SOUND };
	for (const control of SOUND_CONTROLS) {
		const value = source[control.key];
		if (typeof value !== 'number' || !Number.isFinite(value)) continue;
		const clamped = Math.min(control.max, Math.max(control.min, value));
		result[control.key] = control.step >= 1 ? Math.round(clamped) : clamped;
	}
	return result;
}

export const dbToGain = (db: number) => 10 ** (db / 20);

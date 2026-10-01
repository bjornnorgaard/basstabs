export interface Tuning {
	id: string;
	label: string;
	/** String names ordered from lowest to highest pitch. */
	strings: string[];
	/** MIDI note number of each open string, in the same order as `strings`. */
	openMidi: number[];
}

export const TUNINGS: Tuning[] = [
	{
		id: 'standard-4',
		label: '4-string (E A D G)',
		strings: ['E', 'A', 'D', 'G'],
		openMidi: [28, 33, 38, 43]
	},
	{
		id: 'standard-5',
		label: '5-string (B E A D G)',
		strings: ['B', 'E', 'A', 'D', 'G'],
		openMidi: [23, 28, 33, 38, 43]
	},
	{
		id: 'standard-6',
		label: '6-string (B E A D G C)',
		strings: ['B', 'E', 'A', 'D', 'G', 'C'],
		openMidi: [23, 28, 33, 38, 43, 48]
	}
];

export const DEFAULT_TUNING_ID = TUNINGS[0].id;

export function getTuning(id: string | undefined): Tuning {
	return TUNINGS.find((t) => t.id === id) ?? TUNINGS[0];
}

export interface Tuning {
	id: string;
	label: string;
	/** String names ordered from lowest to highest pitch. */
	strings: string[];
}

export const TUNINGS: Tuning[] = [
	{ id: 'standard-4', label: '4-string (E A D G)', strings: ['E', 'A', 'D', 'G'] },
	{ id: 'standard-5', label: '5-string (B E A D G)', strings: ['B', 'E', 'A', 'D', 'G'] },
	{ id: 'standard-6', label: '6-string (B E A D G C)', strings: ['B', 'E', 'A', 'D', 'G', 'C'] }
];

export const DEFAULT_TUNING_ID = TUNINGS[0].id;

export function getTuning(id: string | undefined): Tuning {
	return TUNINGS.find((t) => t.id === id) ?? TUNINGS[0];
}

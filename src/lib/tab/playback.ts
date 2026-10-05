import { groupJoinedEvents, type MeasureLayout } from './render';
import type { Tuning } from './tuning';

export interface ScheduledNote {
	noteId: number;
	measureId: number;
	midi: number;
	/** Start position, in bars from the beginning of the selection. */
	start: number;
	/** Length, in bars. */
	length: number;
}

export interface Schedule {
	notes: ScheduledNote[];
	/** Total length in bars. */
	length: number;
	/** Absolute source tempo changes in bars from the start of this schedule. */
	tempoChanges?: TempoChange[];
}

export interface TempoChange {
	start: number;
	bpm: number;
}

function expandRepeats(measures: MeasureLayout[]): MeasureLayout[] {
	const expanded: MeasureLayout[] = [];
	let repeatStart: number | undefined;
	for (const measure of measures) {
		if (measure.repeatStart && repeatStart === undefined) repeatStart = expanded.length;
		expanded.push(measure);
		if (measure.repeatEnd && repeatStart !== undefined) {
			const phrase = expanded.slice(repeatStart);
			for (let pass = 1; pass < measure.repeatEnd.count; pass++) expanded.push(...phrase);
			repeatStart = undefined;
		}
	}
	return expanded;
}

function tempoChangesFor(measures: MeasureLayout[]): TempoChange[] | undefined {
	const changes: TempoChange[] = [];
	let current: number | undefined;
	measures.forEach((measure, bar) => {
		if (measure.tempoBpm === undefined || measure.tempoBpm === current) return;
		current = measure.tempoBpm;
		changes.push({ start: bar, bpm: measure.tempoBpm });
	});
	return changes.length > 0 ? changes : undefined;
}

/**
 * Turns measures into timed notes. Unmarked bars keep the legacy behaviour: every bar lasts
 * the same time and is split evenly between note groups. Bars with explicit rhythm markers
 * use their written durations; any remaining time in the bar is silent.
 */
export function buildSchedule(measures: MeasureLayout[], tuning: Tuning): Schedule {
	const notes: ScheduledNote[] = [];
	const expanded = expandRepeats(measures);
	expanded.forEach((measure, bar) => {
		if (measure.timed) {
			let position = 0;
			for (const slot of measure.timingSlots) {
				const length = slot.duration / Math.max(slot.notes.length, 1);
				slot.notes.forEach((note, i) => {
					if (note.fret === undefined) return;
					notes.push({
						noteId: note.id,
						measureId: measure.id,
						midi: tuning.openMidi[note.string] + note.fret,
						start: bar + position + i * length,
						length
					});
				});
				position += slot.duration;
			}
			return;
		}

		const groups = groupJoinedEvents(measure.notes);
		if (groups.length === 0) return;
		const slot = 1 / groups.length;
		groups.forEach((group, slotIndex) => {
			const length = slot / group.length;
			group.forEach((note, i) => {
				if (note.fret === undefined) return;
				notes.push({
					noteId: note.id,
					measureId: measure.id,
					midi: tuning.openMidi[note.string] + note.fret,
					start: bar + slotIndex * slot + i * length,
					length
				});
			});
		});
	});
	const tempoChanges = tempoChangesFor(expanded);
	return {
		notes,
		length: expanded.length,
		...(tempoChanges ? { tempoChanges } : {})
	};
}

export function midiToFrequency(midi: number): number {
	return 440 * 2 ** ((midi - 69) / 12);
}

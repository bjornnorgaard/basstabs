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
}

/**
 * Turns measures into timed notes. Unmarked bars keep the legacy behaviour: every bar lasts
 * the same time and is split evenly between note groups. Bars with explicit rhythm markers
 * use their written durations; any remaining time in the bar is silent.
 */
export function buildSchedule(measures: MeasureLayout[], tuning: Tuning): Schedule {
	const notes: ScheduledNote[] = [];
	measures.forEach((measure, bar) => {
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
	return { notes, length: measures.length };
}

export function midiToFrequency(midi: number): number {
	return 440 * 2 ** ((midi - 69) / 12);
}

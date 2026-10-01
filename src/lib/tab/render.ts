import { parse, type System, type TabEvent } from './parser';
import type { Tuning } from './tuning';

const FILL = '-';
const BAR = '|';

function eventCell(event: TabEvent, stringIdx: number, width: number): string {
	const text = event.string === stringIdx ? String(event.fret) : '';
	return text.padEnd(width, FILL);
}

function eventWidth(event: TabEvent): number {
	// Each column is the note plus one trailing filler so notes never touch.
	return String(event.fret).length + 1;
}

export function renderSystem(system: System, tuning: Tuning): string {
	const nameWidth = Math.max(...tuning.strings.map((s) => s.length));
	const highToLow = tuning.strings.map((name, idx) => ({ name, idx })).reverse();

	return highToLow
		.map(({ name, idx }) => {
			const measures = system.measures.map((m) =>
				m.events.map((e) => eventCell(e, idx, eventWidth(e))).join('')
			);
			return name.padEnd(nameWidth) + BAR + measures.map((m) => m + BAR).join('');
		})
		.join('\n');
}

export function renderSystems(systems: System[], tuning: Tuning): string {
	return systems.map((s) => renderSystem(s, tuning)).join('\n\n');
}

/** Parse and render in one go. */
export function renderTab(source: string, tuning: Tuning) {
	const { systems, errors } = parse(source, tuning);
	return { text: renderSystems(systems, tuning), errors };
}

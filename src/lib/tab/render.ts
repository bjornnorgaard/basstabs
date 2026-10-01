import { parse, type System, type TabBlock, type TabEvent } from './parser';
import type { Tuning } from './tuning';

const FILL = '-';
const BAR = '|';

function eventWidth(event: TabEvent): number {
	// Each column is the note plus one trailing filler so notes never touch.
	return String(event.fret).length + 1;
}

/**
 * Splits a measure's events into runs of notes that were written back-to-back with no
 * whitespace between them (see `NoteEvent.joinedToPrevious`). Each run is rendered as a
 * single packed column group: the digits sit immediately next to each other, and the
 * filler that normally separates notes is batched once at the end of the run instead of
 * being inserted after every note.
 */
function groupJoinedEvents(events: TabEvent[]): TabEvent[][] {
	const groups: TabEvent[][] = [];
	for (const event of events) {
		const previousGroup = groups[groups.length - 1];
		if (event.joinedToPrevious && previousGroup) {
			previousGroup.push(event);
		} else {
			groups.push([event]);
		}
	}
	return groups;
}

function groupCell(group: TabEvent[], stringIdx: number): string {
	const digits = group
		.map((e) => (e.string === stringIdx ? String(e.fret) : FILL.repeat(String(e.fret).length)))
		.join('');
	const width = group.reduce((sum, e) => sum + eventWidth(e), 0);
	return digits.padEnd(width, FILL);
}

export function renderSystem(system: System, tuning: Tuning): string {
	const nameWidth = Math.max(...tuning.strings.map((s) => s.length));
	const highToLow = tuning.strings.map((name, idx) => ({ name, idx })).reverse();

	return highToLow
		.map(({ name, idx }) => {
			const measures = system.measures.map((m) =>
				groupJoinedEvents(m.events)
					.map((group) => groupCell(group, idx))
					.join('')
			);
			return name.padEnd(nameWidth) + BAR + measures.map((m) => m + BAR).join('');
		})
		.join('\n');
}

export function renderSystems(systems: System[], tuning: Tuning): string {
	return systems.map((s) => renderSystem(s, tuning)).join('\n\n');
}

export function renderBlocks(blocks: TabBlock[], tuning: Tuning): string {
	return blocks
		.map((block, index) => {
			const previous = blocks[index - 1];
			const separator = previous?.kind === 'system' ? '\n\n' : previous ? '\n' : '';
			const text =
				block.kind === 'system'
					? renderSystem(block, tuning)
					: block.kind === 'section'
						? `[${block.title}]`
						: `#${block.text ? ` ${block.text}` : ''}`;
			return separator + text;
		})
		.join('');
}

/** Parse and render in one go. */
export function renderTab(source: string, tuning: Tuning) {
	const { blocks, errors } = parse(source, tuning);
	return { text: renderBlocks(blocks, tuning), errors };
}

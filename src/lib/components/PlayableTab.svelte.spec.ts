import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import { renderTab } from '$lib/tab/render';
import { getTuning } from '$lib/tab/tuning';

const mocks = vi.hoisted(() => {
	const player = {
		playing: false,
		loop: false,
		looping: false,
		bpm: 100,
		key: null as string | null,
		label: '',
		activeNoteId: null as number | null,
		activeMeasureId: null as number | null,
		play: vi.fn((_, options: { key: string; label: string; loop: boolean }) => {
			player.key = options.key;
			player.label = options.label;
			player.playing = true;
			player.looping = options.loop;
		}),
		stop: vi.fn(() => {
			player.key = null;
			player.label = '';
			player.playing = false;
			player.looping = false;
		}),
		toggleLoop: vi.fn(() => {
			player.looping = !player.looping;
		}),
		setBpm: vi.fn((bpm: number) => {
			player.bpm = bpm;
		})
	};
	return { player };
});

vi.mock('$lib/audio/player.svelte', () => ({ player: mocks.player }));

import PlayableTab from '$lib/components/PlayableTab.svelte';

describe('PlayableTab interactions', () => {
	it('plays a clicked bar, stops it on the next click, and shift-clicks as a loop', async () => {
		const tuning = getTuning('standard-4');
		const { layout } = renderTab('E0 A2 |', tuning);
		const screen = await render(PlayableTab, { props: { layout, tuning } });
		const bar = screen.getByRole('button', { name: 'Play bar 1' });
		mocks.player.stop.mockClear();

		await bar.click();

		expect(mocks.player.play).toHaveBeenCalledTimes(1);
		expect(mocks.player.play.mock.calls[0][1]).toEqual({
			key: 'bar:0',
			label: 'bar 1',
			loop: false
		});

		await bar.click();

		expect(mocks.player.stop).toHaveBeenCalledTimes(1);

		bar.element().dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
		await tick();

		expect(mocks.player.play).toHaveBeenCalledTimes(2);
		expect(mocks.player.play.mock.calls[1][1]).toEqual({
			key: 'bar:0',
			label: 'bar 1',
			loop: true
		});
	});
});

import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTab } from '$lib/tab/render';
import { getTuning } from '$lib/tab/tuning';

const mocks = vi.hoisted(() => {
	const player = {
		playing: false,
		loop: false,
		looping: false,
		bpm: 100,
		sourceTempoActive: false,
		activeBpm: 100,
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
	beforeEach(() => {
		mocks.player.play.mockClear();
		mocks.player.stop.mockClear();
		mocks.player.toggleLoop.mockClear();
		mocks.player.setBpm.mockClear();
		Object.assign(mocks.player, {
			playing: false,
			loop: false,
			looping: false,
			bpm: 100,
			sourceTempoActive: false,
			activeBpm: 100,
			key: null,
			label: '',
			activeNoteId: null,
			activeMeasureId: null
		});
	});

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

	it('passes expanded repeats to Play all', async () => {
		const tuning = getTuning('standard-4');
		const { layout } = renderTab('|: E0 | A2 :|x3', tuning);
		const screen = await render(PlayableTab, { props: { layout, tuning } });

		await screen.getByRole('button', { name: 'Play all' }).click();

		expect(mocks.player.play).toHaveBeenCalledTimes(1);
		const schedule = mocks.player.play.mock.calls[0][0];
		expect(schedule.length).toBe(6);
		expect(
			schedule.notes.map((note: { midi: number; start: number; measureId: number }) => [
				note.midi,
				note.start,
				note.measureId
			])
		).toEqual([
			[28, 0, 0],
			[35, 1, 1],
			[28, 2, 0],
			[35, 3, 1],
			[28, 4, 0],
			[35, 5, 1]
		]);
	});

	it('shows source tempo in the BPM control while a tempo-marked tab is playing', async () => {
		const tuning = getTuning('standard-4');
		const { layout } = renderTab('@140\nE0 |', tuning);
		mocks.player.sourceTempoActive = true;
		mocks.player.activeBpm = 140;

		const screen = await render(PlayableTab, { props: { layout, tuning } });
		const bpm = screen.getByRole('spinbutton', { name: 'BPM' });

		await expect.element(bpm).toHaveValue(140);
		await expect.element(bpm).toBeDisabled();
		await expect.element(screen.getByText('from tab')).toBeVisible();
	});
});

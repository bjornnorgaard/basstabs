import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import { renderTab } from '$lib/tab/render';
import { getTuning } from '$lib/tab/tuning';

vi.mock('$lib/audio/player.svelte', () => ({
	player: {
		activeNoteId: null
	}
}));

import ShorthandEditor from '$lib/components/ShorthandEditor.svelte';

describe('ShorthandEditor invalid tokens', () => {
	it('marks malformed shorthand tokens in the mounted editor', async () => {
		const source = 'E0 [abc]';
		const tuning = getTuning('standard-4');
		const result = renderTab(source, tuning);
		const screen = await render(ShorthandEditor, {
			props: {
				value: source,
				tokens: result.tokens,
				tuning,
				invalid: result.errors.length > 0,
				oninput: vi.fn()
			}
		});

		await vi.waitFor(() => {
			expect(screen.container.querySelector('.hl-invalid')?.textContent).toBe('[abc]');
		});
		await expect
			.element(screen.getByLabelText('Tab shorthand'))
			.toHaveAttribute('aria-invalid', 'true');
	});
});

import { describe, expect, it } from 'vitest';
import { firstSystemPreview } from './preview';

describe('firstSystemPreview', () => {
	it('keeps headings and the first system only', () => {
		const preview = firstSystemPreview({
			tuningId: 'standard-4',
			source: '[Intro]\n# softly\nE0 |\n\n[Verse]\nA2 |'
		});

		expect(preview.tuning.id).toBe('standard-4');
		expect(preview.blocks.map((block) => block.kind)).toEqual(['section', 'annotation', 'system']);
		expect(preview.blocks).toHaveLength(3);
	});

	it('returns no blocks for empty sources so TabPreview can render its placeholder', () => {
		expect(firstSystemPreview({ tuningId: 'standard-5', source: '  \n\n' })).toMatchObject({
			tuning: { id: 'standard-5' },
			blocks: []
		});
	});
});

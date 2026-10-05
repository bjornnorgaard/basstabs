import type { BassTab } from '$lib/stores/tabs.svelte';
import { renderTab, type BlockLayout } from '$lib/tab/render';
import { getTuning, type Tuning } from '$lib/tab/tuning';

export interface TabPreviewData {
	tuning: Tuning;
	blocks: BlockLayout[];
}

export function firstSystemPreview(tab: Pick<BassTab, 'source' | 'tuningId'>): TabPreviewData {
	const tuning = getTuning(tab.tuningId);
	const { blocks } = renderTab(tab.source, tuning).layout;
	const firstSystem = blocks.findIndex((block) => block.kind === 'system');
	return { tuning, blocks: firstSystem < 0 ? blocks : blocks.slice(0, firstSystem + 1) };
}

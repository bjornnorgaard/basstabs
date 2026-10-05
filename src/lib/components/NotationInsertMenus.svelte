<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { NOTATION_GROUPS, type Snippet } from '$lib/tab/insert';

	let { oninsert }: { oninsert: (snippet: Snippet) => void } = $props();

	const snippets = new Map<string, Snippet>(
		NOTATION_GROUPS.flatMap((group) =>
			group.items.map((item) => [`${group.id}:${item.label}`, item.snippet] as const)
		)
	);

	function select({ value }: { value: string }) {
		const snippet = snippets.get(value);
		if (snippet) oninsert(snippet);
	}
</script>

{#each NOTATION_GROUPS as group (group.id)}
	<Menu positioning={{ placement: 'bottom-start' }} onSelect={select}>
		<Menu.Trigger
			class="btn preset-tonal btn-sm"
			title="Insert {group.label.toLowerCase()} notation"
			data-testid="notation-menu-{group.id}"
		>
			{group.label}
			<ChevronDown class="size-3.5" />
		</Menu.Trigger>
		<Portal>
			<Menu.Positioner class="z-50!">
				<Menu.Content
					class="max-h-[70vh] w-72 overflow-y-auto card border border-surface-200-800 bg-surface-50-950 p-1 shadow-xl"
				>
					{#each group.items as item (item.label)}
						<Menu.Item
							value="{group.id}:{item.label}"
							class="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:preset-tonal data-highlighted:preset-tonal"
						>
							<span
								class="w-10 shrink-0 text-center font-tab font-bold {item.glyphClass ??
									group.glyphClass}">{item.glyph}</span
							>
							<Menu.ItemText class="flex-1">{item.label}</Menu.ItemText>
							<code class="font-tab text-xs opacity-60">{item.example}</code>
						</Menu.Item>
					{/each}
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>
{/each}

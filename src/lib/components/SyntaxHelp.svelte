<script lang="ts">
	import Info from '@lucide/svelte/icons/info';
	import type { Tuning } from '$lib/tab/tuning';

	let { tuning }: { tuning: Tuning } = $props();

	const rows = $derived([
		{
			syntax: `${tuning.strings[0]}3`,
			meaning: `Fret 3 on the ${tuning.strings[0]} string. Strings: ${tuning.strings.join(' ')}.`
		},
		{ syntax: '5', meaning: 'Fret 5 on the same string as the previous note.' },
		{ syntax: '|', meaning: 'Bar line – ends the current measure.' },
		{ syntax: '↵ new line', meaning: 'Starts a new row of tab.' },
		{ syntax: '[Verse 1]', meaning: 'Names the section that follows. Use a line of its own.' },
		{
			syntax: '# Play softly',
			meaning: 'Displays a note or rough lyrics above the next row. Use a line of its own.'
		}
	]);
</script>

<details class="card preset-tonal-surface p-4 text-sm">
	<summary class="flex cursor-pointer items-center gap-2 font-semibold select-none">
		<Info class="size-4" /> Syntax cheat sheet
	</summary>
	<div class="mt-3 table-wrap">
		<table class="table">
			<tbody>
				{#each rows as row (row.syntax)}
					<tr>
						<td class="w-28"><code>{row.syntax}</code></td>
						<td>{row.meaning}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="mt-3 opacity-75">
		Example: <code>E0 0 A2 2 | E0 0 3 A2 |</code>. String names are case-insensitive and every note
		gets its own column. Notes can be adjacent, too: <code>A2E320</code> means
		<code>A2 E3 2 0</code>.
	</p>
</details>

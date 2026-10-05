<script lang="ts">
	import Info from '@lucide/svelte/icons/info';
	import ShorthandCode from '$lib/components/ShorthandCode.svelte';
	import type { Tuning } from '$lib/tab/tuning';

	let { tuning }: { tuning: Tuning } = $props();

	const rows = $derived([
		{
			syntax: `${tuning.strings[0]}3`,
			meaning: `Fret 3 on the ${tuning.strings[0]} string. Strings: ${tuning.strings.join(' ')}.`
		},
		{
			syntax: `${tuning.strings[0]}3 5`,
			meaning: 'A bare fret stays on the previous string – it keeps that string’s colour.'
		},
		{
			syntax: `${tuning.strings[0]}[12]3`,
			meaning: 'Brackets mean one multi-digit fret: fret 12, then a joined fret 3.'
		},
		{
			syntax: `${tuning.strings[0]}123`,
			meaning: 'Unbracketed digits are separate frets: a joined run of frets 1, 2, and 3.'
		},
		{
			syntax: `${tuning.strings[0]}5h7 ${tuning.strings[0]}7p5 ${tuning.strings[0]}3/5 ${tuning.strings[0]}5\\3`,
			meaning: 'Hammer-on, pull-off and slides connect two frets on one string.'
		},
		{
			syntax: `${tuning.strings[0]}5b ${tuning.strings[0]}5~ ${tuning.strings[0]}x ${tuning.strings[0]}(5)`,
			meaning: 'Bend, vibrato, dead note and ghost note notation.'
		},
		{
			syntax: `:q ${tuning.strings[0]}0 0 :e 0 0`,
			meaning:
				'Duration markers are sticky within a bar: whole, half, quarter, eighth or sixteenth.'
		},
		{
			syntax: ':q. E0 :r :re 0',
			meaning:
				'Add . for dotted notes. :r is a rest using the current duration; :re is an eighth rest.'
		},
		{ syntax: '|', meaning: 'Bar line – ends the current measure.' },
		{
			syntax: `|: ${tuning.strings[0]}0 0 :|x3`,
			meaning: 'Repeat the marked phrase three total times. Omit x3 for the default two plays.'
		},
		{
			syntax: '@120',
			meaning: 'Tempo marker on its own line – sets playback to 120 BPM from that point.',
			plain: true
		},
		{ syntax: '↵ new line', meaning: 'Starts a new row of tab.', plain: true },
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
						<td class="w-28">
							<ShorthandCode source={row.syntax} tuning={row.plain ? undefined : tuning} />
						</td>
						<td>{row.meaning}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="mt-3 opacity-75">
		Example: <ShorthandCode source="E0 0 A2 2 | E0 0 3 A2 |" {tuning} />. String names are
		case-insensitive. Each fret digit and space occupies one tab column; no blanks are added
		automatically. Notes can be adjacent, too:
		<ShorthandCode source="A2E320" {tuning} /> means <ShorthandCode source="A2 E3 2 0" {tuning} />.
		Spaces after the last note extend the bar by exactly that many blank columns. Brackets and
		string names occupy no tab columns. Articulation characters also occupy tab columns: <ShorthandCode
			source={`${tuning.strings[0]}5h7`}
			{tuning}
		/> is three columns. Rhythm markers such as <ShorthandCode source=":q" {tuning} /> and
		<ShorthandCode source=":r" {tuning} /> do not occupy tab columns, but spaces around them still do.
		Repeat markers such as <ShorthandCode source="|:" {tuning} /> and
		<ShorthandCode source=":|" {tuning} /> are barlines. Existing rhythm shorthand like
		<ShorthandCode source="|:q E0" {tuning} /> stays a plain barline plus duration marker; write
		<ShorthandCode source="|: :q E0 :|" {tuning} /> when a repeated bar starts with a duration marker.
		A bare bracketed fret reuses the previous string; use <ShorthandCode
			source="E0 |[12]|"
			{tuning}
		/> rather than putting
		<code>[12]</code> on its own line, where it names a section.
	</p>
	<p class="mt-2 opacity-75">
		Colours match between the shorthand and the tab: every string has its own colour, sections are
		tinted and comments are muted. Put the caret on a note to outline it in the tab.
	</p>
</details>

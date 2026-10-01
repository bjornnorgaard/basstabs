<script lang="ts">
	import Highlighter from '@lucide/svelte/icons/highlighter';

	let enabled = $state(document.documentElement.dataset.highlight !== 'off');

	function toggle() {
		enabled = !enabled;
		document.documentElement.dataset.highlight = enabled ? 'on' : 'off';
		localStorage.setItem('basstabs:highlight', enabled ? 'on' : 'off');
	}
</script>

<button
	type="button"
	class="btn-icon {enabled ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
	onclick={toggle}
	aria-pressed={enabled}
	aria-label="Syntax highlighting"
	title={enabled ? 'Turn syntax highlighting off' : 'Turn syntax highlighting on'}
>
	<Highlighter class="size-5" />
</button>

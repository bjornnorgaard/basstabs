<script lang="ts">
	import '@fontsource/caveat/500.css';
	import { resolve } from '$app/paths';
	import Guitar from '@lucide/svelte/icons/guitar';
</script>

<a href={resolve('/')} class="group flex items-center gap-2" aria-label="basstabs by bear – home">
	<Guitar class="size-6 text-primary-500" />
	<span class="flex items-baseline text-xl font-bold">
		<span>bass<span class="text-primary-500">tabs</span></span>
		<span
			class="ml-1.5 inline-block -rotate-6 font-signature text-base font-medium opacity-50 transition-opacity group-hover:opacity-80 max-[360px]:hidden"
			aria-hidden="true">by bear</span
		>
	</span>
</a>

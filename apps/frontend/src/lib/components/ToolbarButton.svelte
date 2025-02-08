<script lang="ts">
	import type { Component } from 'svelte';
	import type { ClassValue } from 'svelte/elements';

	interface Props {
		icon: Component;

		tooltip: string;

		class?: string;

		iconClass?: ClassValue;
	}

	let { icon: Icon, tooltip, class: className, iconClass }: Props = $props();
</script>

<div class="tooltip tooltip-bottom" data-tip={tooltip}>
	<button class="btn btn-ghost btn-circle rounded-box p-0 {className}">
		<Icon class="size-6 {iconClass}" />
	</button>
</div>

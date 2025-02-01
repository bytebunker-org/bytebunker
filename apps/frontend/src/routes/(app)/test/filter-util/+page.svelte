<script lang="ts">
	import { Button, ButtonGroup } from '@bytebunker/daisyui-components';
	import { range } from '$lib/util/util.js';
	import { FilterQueryUtil } from '$lib/util/filterQueryUtil.svelte.js';

	const filter = new FilterQueryUtil({
		testNum: {
			type: 'number',
			default: 42
		},
		page: {
			type: 'number',
			default: 1
		}
	});

	let pageCount = 20;
</script>

<div class="prose">
	<Button on:click={() => filter.applyFilter({ testNum: filter.filters.testNum - 1 })}>Prev</Button>
	{filter.filters.testNum}
	<Button on:click={() => filter.applyFilter({ testNum: filter.filters.testNum + 2 })}>Next</Button>

	<hr />

	<div class="mockup-code mb-2">
		<pre><code>Page {filter.filters.page}</code></pre>
	</div>
	<ButtonGroup class="*:no-underline">
		<Button href={filter.buildFilterUrl({ page: 1 })} data-sveltekit-replacestate>&lAarr;</Button>
		<Button
			href={filter.buildFilterUrl({ page: filter.filters.page - 1 })}
			data-sveltekit-replacestate>&lang;</Button
		>
		{#each range(1, pageCount + 1) as page}
			<Button
				href={filter.buildFilterUrl({ page })}
				active={filter.filters.page === page}
				data-sveltekit-replacestate>{page}</Button
			>
		{/each}
		<Button
			href={filter.buildFilterUrl({ page: filter.filters.page + 1 })}
			data-sveltekit-replacestate>&rang;</Button
		>
		<Button href={filter.buildFilterUrl({ page: pageCount })} data-sveltekit-replacestate
			>&rAarr;</Button
		>
	</ButtonGroup>

	<hr />
	<pre><code>{JSON.stringify(filter.filters)}</code></pre>
</div>

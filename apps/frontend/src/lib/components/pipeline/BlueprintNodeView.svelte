<script lang="ts">
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		type Node,
		type Edge,
		Position
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	// import '$lib/css/svelte-flow.css';
	import { Blueprint } from '@bytebunker/backend';
	import { nodeTypes } from '$lib/components/pipeline/blueprintUtil.js';

	interface Props {
		blueprint: Blueprint;
	}

	let { blueprint }: Props = $props();

	const nodes = $state.raw(
		blueprint.getNodes().map(
			(node) =>
				({
					id: String(node.id),
					type: 'blueprint',
					data: { label: node.moduleId, ...node },
					position: node.position,
					handles: [
						{
							type: 'source',
							x: 1,
							y: 1,
							position: Position.Right
						},
						{
							type: 'source',
							x: 1,
							y: 20,
							position: Position.Right
						}
					]
				}) satisfies Node
		)
	);

	const edges = $state.raw([
		{
			id: '1-2',
			type: 'default',
			source: '1',
			target: '2',
			label: 'Edge Text'
		} satisfies Edge
	]);
</script>

<!--
👇 By default, the Svelte Flow container has a height of 100%.
This means that the parent container needs a height to render the flow.
-->
<div style:height="500px" class="rounded-box overflow-hidden">
	<SvelteFlow
		{nodeTypes}
		{nodes}
		{edges}
		fitView
		onnodeclick={(event) => console.log('on node click', event.node)}
	>
		<Controls />
		<Background variant={BackgroundVariant.Dots} />
		<MiniMap />
	</SvelteFlow>
</div>

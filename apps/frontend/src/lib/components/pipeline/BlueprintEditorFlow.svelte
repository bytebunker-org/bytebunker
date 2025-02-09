<script lang="ts">
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		type Node,
		type Edge,
		useSvelteFlow
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import {
		type BlueprintEdgeData,
		type BlueprintNodeData,
		nodeTypes
	} from '$lib/components/pipeline/blueprintUtil.js';
	import { getBlueprintEditorContext } from '$lib/components/pipeline/blueprintContext.js';
	import {
		transformBlueprintEdgeToFlowEdge,
		transformBlueprintNodeToFlowNode
	} from '$lib/components/pipeline/blueprintTransformer.js';
	import type { BlueprintNodeDto, PipelineModuleIdentifier } from '@bytebunker/backend';

	let editorContext = getBlueprintEditorContext()();
	let blueprint = $derived(editorContext.blueprint);
	let pipelineModules = $derived(editorContext.pipelineModules);

	let nodes = $state.raw<Node<BlueprintNodeData>[]>([]);
	let edges = $state.raw<Edge<BlueprintEdgeData>[]>([]);

	$effect(() => {
		nodes = transformBlueprintNodeToFlowNode(blueprint, pipelineModules);
		edges = transformBlueprintEdgeToFlowEdge(blueprint, pipelineModules);
	});

	let maxNodeId = $derived(Math.max(...nodes.map((n) => Number.parseInt(n.id))));

	const { screenToFlowPosition } = $derived(useSvelteFlow());

	function onDragOver(event: DragEvent) {
		event.preventDefault();

		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();

		if (!event.dataTransfer?.types.includes('item/pipeline-module')) {
			return;
		}

		const newModuleId = event.dataTransfer.getData(
			'item/pipeline-module'
		) as PipelineModuleIdentifier;

		const position = screenToFlowPosition({
			x: event.clientX,
			y: event.clientY
		});

		const newNodeId = maxNodeId + 1;

		const newNode = {
			id: String(newNodeId),
			type: 'blueprint',
			position,
			data: {
				id: newNodeId,
				moduleId: newModuleId,
				constantInputData: {},
				position
			} satisfies BlueprintNodeDto,
			origin: [0.5, 0.0]
		} satisfies Node;

		nodes = [...nodes, newNode];
	}

	$inspect(nodes);
</script>

<SvelteFlow
	{nodeTypes}
	bind:nodes
	bind:edges
	fitView
	onnodeclick={(event) => console.log('on node click', event.node)}
	deleteKey="Delete"
	ondragover={onDragOver}
	ondrop={onDrop}
>
	<Controls />
	<Background variant={BackgroundVariant.Lines} />
	<MiniMap />
</SvelteFlow>

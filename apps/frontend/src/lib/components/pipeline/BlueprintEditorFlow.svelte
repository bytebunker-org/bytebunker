<script lang="ts">
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		type Node,
		type Edge,
		useSvelteFlow,
		type Connection,
		ConnectionLineType
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import {
		type BlueprintEdgeData,
		type BlueprintNodeData,
		isValidConnection,
		nodeTypes
	} from '$lib/components/pipeline/blueprintUtil.js';
	import {
		getBlueprintEditorContext,
		getBlueprintSerializeFunctionContext
	} from '$lib/components/pipeline/blueprintContext.js';
	import {
		serializeBlueprintFlow,
		transformBlueprintEdgeToFlowEdge,
		transformBlueprintNodeToFlowNode
	} from '$lib/components/pipeline/blueprintTransformer.svelte.js';
	import { getBlueprintFocusContext } from '$lib/components/pipeline/validation/blueprintFocusContext.js';
	import type {
		Blueprint,
		BlueprintNodeDto,
		PipelineModuleIdentifier,
		BlueprintDataDto
	} from '@bytebunker/backend';

	let editorContext = getBlueprintEditorContext()();
	let blueprint = $derived(editorContext.blueprint);
	let pipelineModules = $derived(editorContext.pipelineModules);

	let nodes = $state.raw<Node<BlueprintNodeData>[]>(
		transformBlueprintNodeToFlowNode(() => ({ blueprint, pipelineModules }))
	);
	let edges = $state.raw<Edge<BlueprintEdgeData>[]>(
		transformBlueprintEdgeToFlowEdge(() => ({ blueprint, pipelineModules }))
	);
	let allowEdit = $derived(editorContext.allowEdit);

	let maxNodeId = $derived(Math.max(0, ...nodes.map((n) => Number.parseInt(n.id))));

	const { screenToFlowPosition, fitView } = $derived(useSvelteFlow());

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

	// The connection check has to see nodes added or edited since the editor was opened
	const currentNodes = {
		getNode: (nodeId: number) => nodes.find((n) => n.id === String(nodeId))?.data
	} as unknown as Blueprint;

	const focusStore = getBlueprintFocusContext();
	$effect(() => {
		if (!focusStore) {
			return;
		}

		focusStore.current = (nodeId) => {
			const id = String(nodeId);

			if (!nodes.some((n) => n.id === id)) {
				return;
			}

			nodes = nodes.map((n) => ({ ...n, selected: n.id === id }));
			fitView({ nodes: [{ id }], duration: 400, maxZoom: 1.2, padding: 0.5 });
		};

		return () => {
			focusStore.current = undefined;
		};
	});

	function serialize(
		nodes: Node<BlueprintNodeData>[],
		edges: Edge<BlueprintEdgeData>[]
	): BlueprintDataDto {
		return serializeBlueprintFlow(
			nodes as Node<BlueprintNodeData>[],
			edges as Edge<BlueprintEdgeData>[]
		);
	}

	// Horrible hack but svelte 5 has some really weird behaviors
	// TODO: Create an issue/find a better way?
	const serializeFunctionStore = getBlueprintSerializeFunctionContext();
	$effect(() => {
		if (allowEdit) {
			let _nodes = nodes;
			let _edges = edges;

			serializeFunctionStore.current = () => serialize(_nodes, _edges);
		}
	});
</script>

<SvelteFlow
	{nodeTypes}
	bind:nodes
	bind:edges
	fitView
	deleteKey={['Delete', 'Backspace']}
	ondragover={onDragOver}
	ondrop={onDrop}
	connectionLineType={ConnectionLineType.SmoothStep}
	defaultEdgeOptions={{ type: ConnectionLineType.SmoothStep }}
	isValidConnection={(connection: Connection | Edge) =>
		isValidConnection(currentNodes, pipelineModules, connection)}
	snapGrid={[20, 20]}
	nodesDraggable={allowEdit}
	nodesConnectable={allowEdit}
>
	<Controls showLock={false} />
	<Background variant={BackgroundVariant.Lines} size={20} />
	<MiniMap />
</SvelteFlow>

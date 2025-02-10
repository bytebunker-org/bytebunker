import type {
	Blueprint,
	PipelineModuleIdentifier,
	PipelineModuleDto,
	BlueprintDataDto
} from '@bytebunker/backend';
import { type Edge, type Node, Position } from '@xyflow/svelte';
import type { NodeHandle } from '@xyflow/system';
import type {
	BlueprintEdgeData,
	BlueprintNodeData
} from '$lib/components/pipeline/blueprintUtil.js';

export function transformBlueprintNodeToFlowNode(
	options: () => {
		blueprint: Blueprint;
		pipelineModules: Record<PipelineModuleIdentifier, PipelineModuleDto>;
	}
): Node<BlueprintNodeData>[] {
	const { blueprint, pipelineModules } = options();
	return blueprint.getNodes().map((blueprintNode) => {
		const pipelineModule = pipelineModules[blueprintNode.moduleId];

		if (!pipelineModule) {
			throw new Error(
				`Pipeline module ${blueprintNode.moduleId} for existing node ${blueprintNode.id} not found`
			);
		}

		const headerHeight = 32;
		const handleHeight = 36;

		const inputHandles = Object.entries(
			pipelineModule.inputTypeSchema?.jsonSchema?.properties ?? {}
		).map(
			([handleName], i) =>
				({
					id: handleName,
					type: 'target',
					x: 0,
					y: headerHeight + i * handleHeight,
					position: Position.Left
				}) satisfies NodeHandle
		);

		const outputHandles = Object.entries(
			pipelineModule.inputTypeSchema?.jsonSchema?.properties ?? {}
		).map(
			([handleName], i) =>
				({
					id: handleName,
					type: 'source',
					x: 30,
					y: headerHeight + i * handleHeight,
					position: Position.Right
				}) satisfies NodeHandle
		);

		return {
			id: String(blueprintNode.id),
			type: 'blueprint',
			data: blueprintNode as BlueprintNodeData,
			position: blueprintNode.position,
			handles: [...inputHandles, ...outputHandles]
		} satisfies Node<BlueprintNodeData>;
	});
}

export function transformBlueprintEdgeToFlowEdge(
	options: () => {
		blueprint: Blueprint;
		pipelineModules: Record<PipelineModuleIdentifier, PipelineModuleDto>;
	}
): Edge<BlueprintEdgeData>[] {
	const { blueprint } = options();
	return blueprint.getEdges().map((edge) => {
		return {
			id: String(edge.id),
			source: String(edge.source),
			sourceHandle: edge.sourceHandle,
			target: String(edge.target),
			targetHandle: edge.targetHandle,
			type: 'smoothstep'
		} satisfies Edge<BlueprintEdgeData>;
	});
}

export function serializeBlueprintFlow(
	nodes: Node<BlueprintNodeData>[],
	edges: Edge<BlueprintEdgeData>[]
): BlueprintDataDto {
	return {
		nodes: nodes.map((n) => ({
			id: Number.parseInt(n.id),
			moduleId: n.data.moduleId,
			position: {
				x: Math.floor(Number(n.position.x)),
				y: Math.floor(Number(n.position.y))
			},
			constantInputData: n.data.constantInputData
		})),
		edges: edges.map((e, index) => ({
			id: index,
			source: Number.parseInt(e.source),
			sourceHandle: e.sourceHandle!,
			target: Number.parseInt(e.target),
			targetHandle: e.targetHandle!,
			data: e.data?.data
		}))
	};
}

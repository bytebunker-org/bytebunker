import type { Blueprint, PipelineModuleIdentifier, PipelineModuleDto } from '@bytebunker/backend';
import { type Edge, type Node, Position } from '@xyflow/svelte';
import type { NodeHandle } from '@xyflow/system';
import type {
	BlueprintEdgeData,
	BlueprintNodeData
} from '$lib/components/pipeline/blueprintUtil.js';

export function transformBlueprintNodeToFlowNode(
	blueprint: Blueprint,
	pipelineModules: Record<PipelineModuleIdentifier, PipelineModuleDto>
): Node<BlueprintNodeData>[] {
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
					type: 'target',
					x: 0,
					y: i * 20,
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
	blueprint: Blueprint,
	pipelineModules: Record<PipelineModuleIdentifier, PipelineModuleDto>
): Edge<BlueprintEdgeData>[] {
	return blueprint.getEdges().map((edge) => {
		return {
			id: String(edge.id),
			source: String(edge.source),
			sourceHandle: edge.sourceHandle,
			target: String(edge.target),
			targetHandle: edge.targetHandle
		} satisfies Edge<BlueprintEdgeData>;
	});
}

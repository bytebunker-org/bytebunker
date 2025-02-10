import type { Component } from 'svelte';
import BlueprintNode from '$lib/components/pipeline/BlueprintNode.svelte';
import type { Node, NodeProps, Edge, EdgeProps, Connection } from '@xyflow/svelte';
import type { BlueprintNodeDto, BlueprintEdgeDto } from '@bytebunker/backend';
import type { Blueprint, PipelineModuleIdentifier, PipelineModuleDto } from '@bytebunker/backend';

export interface BlueprintNodeData extends BlueprintNodeDto, Record<string, unknown> {}
export interface BlueprintEdgeData extends BlueprintEdgeDto, Record<string, unknown> {}

export type BlueprintNodeProps = NodeProps<Node<BlueprintNodeData>>;
export type BlueprintEdgeProps = EdgeProps<Edge<BlueprintEdgeData>>;

export type NodeType = 'blueprint';

export const nodeTypes: Record<NodeType, Component<BlueprintNodeProps>> = {
	blueprint: BlueprintNode
};

export const specialHandleNames = ['dependentModules', 'success'];
type SpecialHandleName = (typeof specialHandleNames)[number];
export const allowedSpecialHandleConnections: Partial<
	Record<SpecialHandleName, SpecialHandleName>
> = {
	success: 'dependentModules'
};

export function isValidConnection(
	blueprint: Blueprint,
	pipelineModules: Record<PipelineModuleIdentifier, PipelineModuleDto>,
	edge: Edge | Connection
): boolean {
	const { source, sourceHandle, target, targetHandle } = edge;

	if (source === target) {
		return false;
	}

	if (!sourceHandle || !targetHandle) {
		return false;
	}

	if (specialHandleNames.includes(sourceHandle) || specialHandleNames.includes(targetHandle)) {
		return allowedSpecialHandleConnections[sourceHandle] === targetHandle;
	}

	const sourceNode = blueprint.getNode(Number.parseInt(source));
	const targetNode = blueprint.getNode(Number.parseInt(target));

	if (!sourceNode || !targetNode) {
		return false;
	}

	const sourceModule = pipelineModules[sourceNode.moduleId];
	const targetModule = pipelineModules[targetNode.moduleId];

	if (!sourceModule || !targetModule) {
		return false;
	}

	const sourcePropertySchema = sourceModule.outputTypeSchema?.jsonSchema.properties?.[sourceHandle];
	const targetPropertySchema = targetModule.inputTypeSchema?.jsonSchema.properties?.[targetHandle];

	if (
		sourcePropertySchema &&
		targetPropertySchema &&
		typeof sourcePropertySchema === 'object' &&
		typeof targetPropertySchema === 'object'
	) {
		return (
			sourcePropertySchema.type === targetPropertySchema.type ||
			targetPropertySchema.type === 'array'
		);
	}

	return true;
}

import type { Component } from 'svelte';
import type { JSONSchema7 } from 'json-schema';
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

type HandleKind = 'input' | 'output';

const customHandleKeys: Record<HandleKind, string> = {
	input: 'customInputParameters',
	output: 'customOutputParameters'
};

/** Handles declared by the node itself (execute-code); they carry no type. */
function isCustomHandle(
	node: { constantInputData?: Record<string, unknown> },
	kind: HandleKind,
	handle: string
): boolean {
	const custom = node.constantInputData?.[customHandleKeys[kind]];

	return Array.isArray(custom) && custom.includes(handle);
}

/**
 * `null` = handle does not exist, `undefined` = exists but is untyped (custom handle or module
 * without a schema), otherwise the property schema.
 */
function resolveHandleSchema(
	node: { constantInputData?: Record<string, unknown> },
	pipelineModule: PipelineModuleDto,
	kind: HandleKind,
	handle: string
): JSONSchema7 | undefined | null {
	if (isCustomHandle(node, kind, handle)) {
		return undefined;
	}

	const schema = (
		kind === 'input' ? pipelineModule.inputTypeSchema : pipelineModule.outputTypeSchema
	)?.jsonSchema as JSONSchema7 | undefined;

	if (!schema) {
		return undefined;
	}

	const property = schema.properties?.[handle];

	if (property === undefined) {
		return null;
	}

	return typeof property === 'object' ? property : undefined;
}

/** Same rule as the backend validation: equal types, untyped, or anything into an array input. */
export function areSchemaTypesCompatible(source: JSONSchema7, target: JSONSchema7): boolean {
	return !source.type || !target.type || source.type === target.type || target.type === 'array';
}

/** Mirrors the connection rules of PipelineBlueprintValidationService. */
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

	const sourcePropertySchema = resolveHandleSchema(
		sourceNode,
		sourceModule,
		'output',
		sourceHandle
	);
	const targetPropertySchema = resolveHandleSchema(targetNode, targetModule, 'input', targetHandle);

	// Handle does not exist on the module
	if (sourcePropertySchema === null || targetPropertySchema === null) {
		return false;
	}

	// Untyped handles accept everything
	if (!sourcePropertySchema || !targetPropertySchema) {
		return true;
	}

	return areSchemaTypesCompatible(sourcePropertySchema, targetPropertySchema);
}

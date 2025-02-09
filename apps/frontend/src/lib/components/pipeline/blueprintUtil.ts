import type { Component } from 'svelte';
import BlueprintNode from '$lib/components/pipeline/BlueprintNode.svelte';
import type { Node, NodeProps, Edge, EdgeProps } from '@xyflow/svelte';
import type { BlueprintNodeDto, BlueprintEdgeDto } from '@bytebunker/backend';

export interface BlueprintNodeData extends BlueprintNodeDto, Record<string, unknown> {}
export interface BlueprintEdgeData extends BlueprintEdgeDto, Record<string, unknown> {}

export type BlueprintNodeProps = NodeProps<Node<BlueprintNodeData>>;
export type BlueprintEdgeProps = EdgeProps<Edge<BlueprintEdgeData>>;

export type NodeType = 'blueprint';

export const nodeTypes: Record<NodeType, Component<BlueprintNodeProps>> = {
	blueprint: BlueprintNode
};

export const specialHandleNames = ['dependentModules', 'success'];

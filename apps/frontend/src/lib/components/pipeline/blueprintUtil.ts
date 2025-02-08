import type { Component } from 'svelte';
import BlueprintNode from '$lib/components/pipeline/BlueprintNode.svelte';
import type { Node, NodeProps } from '@xyflow/svelte';
import type { BlueprintNodeDto } from '@bytebunker/backend';

interface BlueprintNodeData extends BlueprintNodeDto, Record<string, unknown> {}

export type BlueprintNodeProps = NodeProps<Node<BlueprintNodeData>>;

export type NodeType = 'blueprint';

export const nodeTypes: Record<NodeType, Component<BlueprintNodeProps>> = {
	blueprint: BlueprintNode
};

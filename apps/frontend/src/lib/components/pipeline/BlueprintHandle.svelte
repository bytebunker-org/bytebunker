<script lang="ts">
	import {
		type BlueprintNodeData,
		specialHandleNames
	} from '$lib/components/pipeline/blueprintUtil.js';
	import type { JSONSchema7Definition } from 'json-schema';
	import { toHeaderCase } from 'js-convert-case';
	import { Handle, Position } from '@xyflow/svelte';

	interface Props {
		nodeData: BlueprintNodeData;

		type: 'input' | 'output';

		name: string;

		schema: JSONSchema7Definition;

		index: number;

		hideLabel: boolean;
	}

	let { nodeData, type, name, schema, index, hideLabel }: Props = $props();

	let isSpecial = $derived(specialHandleNames.includes(name));
	let constantData = $derived(nodeData.constantInputData?.[name]);
	let hasConstantData = $derived(Boolean(constantData));
</script>

<Handle
	id={name}
	type="target"
	position={type === 'input' ? Position.Left : Position.Right}
	class={[
		'!size-3 h-[32px] rounded-none border-none',
		isSpecial ? '!bg-accent' : '!bg-primary',
		hasConstantData ? '!border-neutral-700' : ''
	]}
	style="--handle-index: {index}"
/>
<span
	class={[
		'handle-label flex items-center text-neutral-600 transition-opacity duration-100',
		type === 'input' ? 'pl-2' : 'justify-end pr-2',
		hideLabel ? 'pointer-events-none opacity-0' : ''
	]}
	title="{JSON.stringify(schema)}, constant data: {JSON.stringify(constantData)}"
	>{toHeaderCase(name)}</span
>

<style>
	.handle-label {
		height: var(--handle-height);
	}

	:global(.svelte-flow__handle) {
		top: calc(var(--handle-index) * var(--handle-height) + (var(--handle-height) / 2));
	}
</style>

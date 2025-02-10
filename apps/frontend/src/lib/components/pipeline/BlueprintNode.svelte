<script lang="ts">
	import { type Node, useSvelteFlow, useViewport } from '@xyflow/svelte';
	import {
		type BlueprintNodeData,
		type BlueprintNodeProps,
		specialHandleNames
	} from '$lib/components/pipeline/blueprintUtil.js';
	import { getBlueprintEditorContext } from '$lib/components/pipeline/blueprintContext.js';
	import { deconstructPipelineModuleIdentifier } from '@bytebunker/backend';
	import { toHeaderCase } from 'js-convert-case';
	import BlueprintHandle from '$lib/components/pipeline/BlueprintHandle.svelte';
	import type { JsonSchemaDto, PipelineExecutionDataDto } from '@bytebunker/backend';
	import type { JSONSchema7 } from 'json-schema';
	import { getPipelineModuleNodeInfo } from '$lib/components/pipeline/pipelineModuleNodeRegistry.js';
	import LucidePencil from '~icons/lucide/pencil';
	import LucideFileText from '~icons/lucide/file-text';
	import { getModalContext } from '$lib/context.js';
	import { ModalTypeEnum } from '$lib/components/modal/modalTypeEnum.js';
	import { PipelineExecutionStatusEnum } from '@bytebunker/backend';

	const { updateNodeData } = $derived(useSvelteFlow());

	let { id: nodeId, data, selected }: BlueprintNodeProps = $props();

	let moduleId = $derived(deconstructPipelineModuleIdentifier(data.moduleId));

	let modalContext = getModalContext()();

	let editorContext = getBlueprintEditorContext()();
	let module = $derived(editorContext.pipelineModules[data.moduleId]);
	let pipelineExecution = $derived(editorContext.pipelineExecution);
	let executionData: PipelineExecutionDataDto | undefined = $derived(
		pipelineExecution?.executionData.find((d) => d.nodeId === Number(nodeId))
	);
	let maxHandleAmount = $derived(
		Math.max(
			Object.keys(module.inputTypeSchema?.jsonSchema?.properties ?? {}).length,
			Object.keys(module.outputTypeSchema?.jsonSchema?.properties ?? {}).length
		)
	);

	let blueprintNodeInfo = $derived(getPipelineModuleNodeInfo(data.moduleId));
	let Icon = $derived(blueprintNodeInfo.icon);

	function getHandles(schema: JsonSchemaDto | undefined): [string, JSONSchema7][] {
		if (!schema) {
			return [];
		}

		const entries = Object.entries(schema.jsonSchema?.properties ?? {}) as [string, JSONSchema7][];

		return entries.sort((a, b) => {
			const aIsSpecialHandle = Number(specialHandleNames.includes(a[0]));
			const bIsSpecialHandle = Number(specialHandleNames.includes(b[0]));

			return aIsSpecialHandle - bIsSpecialHandle || a[0].localeCompare(b[0]);
		});
	}

	const viewport = useViewport();

	let enlargedTitle = $derived(viewport.current.zoom < 0.6);

	async function editNode(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		const result = await modalContext.open(ModalTypeEnum.EDIT_BLUEPRINT_NODE, {
			blueprintNode: data,
			pipelineModule: module
		});

		if (result) {
			console.log('result', result);
			updateNodeData(nodeId, (node: Node<BlueprintNodeData>) => {
				node.data = result as BlueprintNodeData;

				return node;
			});
		}
	}

	function viewNodeExecutionInfoModal(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		modalContext.open(ModalTypeEnum.VIEW_NODE_EXECUTION_INFO, {
			blueprintNode: data,
			module,
			executionData: executionData!,
			executionLogs:
				pipelineExecution?.executionLogs?.filter((l) => l.nodeId === Number(nodeId)) ?? []
		});
	}
</script>

<div
	class={[
		'rounded-box bg-base-100 min-w-fit shadow-md transition-all',
		selected ? 'ring-accent ring-2' : '',
		{
			'ring-2': executionData || pipelineExecution,
			'ring-6 shadow-xl': (executionData || pipelineExecution) && enlargedTitle,
			'shadow-indigo-400 ring-indigo-400':
				(!executionData && pipelineExecution) ||
				executionData?.executionStatus === PipelineExecutionStatusEnum.WAITING,
			'shadow-success ring-success':
				executionData?.executionStatus === PipelineExecutionStatusEnum.SUCCESS,
			'shadow-neutral-700 ring-neutral-700':
				executionData?.executionStatus === PipelineExecutionStatusEnum.ABORTED,
			'shadow-error ring-error':
				executionData?.executionStatus === PipelineExecutionStatusEnum.FAILED,
			'shadow-neutral-400 ring-neutral-400':
				executionData?.executionStatus === PipelineExecutionStatusEnum.BRANCH_IGNORED
		}
	]}
	style="--header-height: 32px; --handle-height: 36px; --max-handle-amount: {maxHandleAmount}; --bg-color: {blueprintNodeInfo.backgroundColor}; --fg-color: {blueprintNodeInfo.color}"
>
	{#snippet headerItems()}
		<Icon class="transition-all {enlargedTitle ? 'size-8 opacity-80' : 'ml-2'}" />
		<span class="p-2 {enlargedTitle ? 'py-0' : ''}">{toHeaderCase(moduleId.moduleName)}</span>
		{#if !enlargedTitle}
			<div class="node-buttons">
				<button
					onclick={(e) => (executionData ? viewNodeExecutionInfoModal(e) : editNode(e))}
					class="btn btn-xs btn-ghost rounded-tr-box aspect-square h-[32px] w-auto rounded-none p-0 hover:bg-white/40"
				>
					{#if executionData}
						<LucideFileText />
					{:else}
						<LucidePencil />
					{/if}
				</button>
			</div>
		{/if}
	{/snippet}
	<div
		class={[
			'node-header fixed top-0 right-0 left-0 flex w-full items-center border-b border-neutral-300 text-center font-bold transition-all duration-100',
			enlargedTitle
				? 'rounded-box h-full flex-col items-center justify-center p-1 text-2xl text-wrap'
				: 'rounded-t-box h-[32px] min-w-fit justify-between gap-1 text-nowrap'
		]}
	>
		{@render headerItems()}
	</div>
	<div class="h-[32px] min-w-fit">
		{#if !enlargedTitle}
			<div
				class="flex items-center justify-between gap-1 text-center font-bold text-nowrap opacity-0"
			>
				{@render headerItems()}
			</div>
		{/if}
	</div>
	<div class="node-handles flex flex-row justify-between gap-2">
		<div class="relative flex flex-col">
			{#each getHandles(module.inputTypeSchema) as [handleName, handleType], i (handleName)}
				<BlueprintHandle
					nodeData={data}
					type="input"
					name={handleName}
					schema={handleType}
					index={i}
					hideLabel={enlargedTitle}
				/>
			{/each}
		</div>
		<div class="relative flex flex-col">
			{#each getHandles(module.outputTypeSchema) as [handleName, handleType], i (handleName)}
				<BlueprintHandle
					nodeData={data}
					type="output"
					name={handleName}
					schema={handleType}
					index={i}
					hideLabel={enlargedTitle}
				/>
			{/each}
		</div>
	</div>
</div>

<style>
	.node-handles {
		height: calc(var(--handle-height) * var(--max-handle-amount));
	}

	.node-header {
		background: linear-gradient(200deg, rgba(255, 255, 255, 0.4), transparent 100%),
			linear-gradient(0deg, var(--bg-color), var(--bg-color));
		color: var(--fg-color);
	}

	.node-buttons button:hover {
		border-color: var(--bg-color) !important;
	}
</style>

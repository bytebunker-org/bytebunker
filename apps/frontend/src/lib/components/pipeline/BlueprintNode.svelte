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
	import type { PipelineExecutionDataDto } from '@bytebunker/backend';
	import type { JSONSchema7 } from 'json-schema';
	import { getPipelineModuleNodeInfo } from '$lib/components/pipeline/pipelineModuleNodeRegistry.js';
	import LucidePencil from '~icons/lucide/pencil';
	import LucideFileText from '~icons/lucide/file-text';
	import { getModalContext } from '$lib/context.js';
	import { ModalTypeEnum } from '$lib/components/modal/modalTypeEnum.js';
	import { PipelineExecutionStatusEnum } from '@bytebunker/backend';
	import LucideAlertTriangle from '~icons/lucide/triangle-alert';
	import LucideCircleAlert from '~icons/lucide/circle-alert';
	import LucideRotateCcw from '~icons/lucide/rotate-ccw';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { PipelineApi } from '$lib/api/PipelineApi.js';
	import { toastManager } from '$lib/util/toastManager.svelte.js';

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
	let queryClient = useQueryClient();
	let progress = $derived(editorContext.nodeProgress?.[Number(nodeId)]);
	let issues = $derived(editorContext.nodeIssues?.[Number(nodeId)] ?? []);
	let errorIssues = $derived(issues.filter((i) => i.severity === 'error'));
	let warningIssues = $derived(issues.filter((i) => i.severity === 'warning'));
	let issueTooltip = $derived(
		issues.map((i) => `${i.severity === 'error' ? '✖' : '⚠'} ${i.message}`).join('\n')
	);

	/** Live status wins over the stored one. */
	let status: string | undefined = $derived(progress?.status ?? executionData?.executionStatus);
	let running = $derived(status === 'running');
	let hasProgress = $derived(
		!!progress && (running || progress.message || progress.fraction !== undefined)
	);
	let progressPercent = $derived(
		progress?.fraction === undefined
			? undefined
			: Math.round(Math.min(1, Math.max(0, progress.fraction)) * 100)
	);
	let retrying = $state(false);

	const numberFormat = new Intl.NumberFormat('de-DE');

	let progressCounts = $derived(
		progress?.current === undefined
			? ''
			: `${numberFormat.format(progress.current)}${
					progress.total === undefined ? '' : ` / ${numberFormat.format(progress.total)}`
				}${progress.unit ? ` ${progress.unit}` : ''}`
	);

	async function retryFromHere(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		if (!pipelineExecution || retrying) {
			return;
		}

		retrying = true;
		try {
			await PipelineApi.retryNode(pipelineExecution.id, Number(nodeId));
			toastManager.showSuccess('Knoten und alle folgenden werden erneut ausgeführt');
			await queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineExecution.id] });
		} catch (e) {
			toastManager.showError(
				`Erneutes Ausführen ab diesem Knoten fehlgeschlagen${e instanceof Error ? `: ${e.message}` : ''}`
			);
		} finally {
			retrying = false;
		}
	}

	let maxHandleAmount = $derived(
		Math.max(
			getHandles('input', module.inputTypeSchema).length,
			getHandles('output', module.outputTypeSchema).length
		)
	);

	let blueprintNodeInfo = $derived(getPipelineModuleNodeInfo(data.moduleId));
	let Icon = $derived(blueprintNodeInfo.icon);

	function getHandles(
		type: 'input' | 'output',
		schema: { jsonSchema?: JSONSchema7 } | undefined
	): [string, JSONSchema7][] {
		if (!schema) {
			return [];
		}

		const hiddenHandles = ['code', 'customInputParameters', 'customOutputParameters'];

		const entries = Object.entries(schema.jsonSchema?.properties ?? {}) as [string, JSONSchema7][];

		if (moduleId.moduleName === 'execute-code') {
			const customHandles =
				(data.constantInputData?.[
					type === 'input' ? 'customInputParameters' : 'customOutputParameters'
				] as string[]) ?? [];

			for (const customHandle of customHandles) {
				entries.push([customHandle, { type: 'null' }]);
			}
		}

		return entries
			.filter(([key]) => !hiddenHandles.includes(key))
			.sort((a, b) => {
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
			'shadow-xl ring-6': (executionData || pipelineExecution) && enlargedTitle,
			'shadow-indigo-400 ring-indigo-400':
				(!status && pipelineExecution) || status === PipelineExecutionStatusEnum.WAITING,
			'shadow-primary ring-primary running-ring': running,
			'shadow-success ring-success': status === PipelineExecutionStatusEnum.SUCCESS,
			'shadow-neutral-700 ring-neutral-700': status === PipelineExecutionStatusEnum.ABORTED,
			'shadow-error ring-error': status === PipelineExecutionStatusEnum.FAILED,
			'shadow-neutral-400 ring-neutral-400': status === PipelineExecutionStatusEnum.BRANCH_IGNORED
		}
	]}
	style="--header-height: 32px; --handle-height: 36px; --max-handle-amount: {maxHandleAmount}; --bg-color: {blueprintNodeInfo.backgroundColor}; --fg-color: {blueprintNodeInfo.color}"
>
	{#snippet headerItems()}
		<Icon class="transition-all {enlargedTitle ? 'size-8 opacity-80' : 'ml-2'}" />
		<span class="p-2 {enlargedTitle ? 'py-0' : ''}">{toHeaderCase(moduleId.moduleName)}</span>
		{#if !enlargedTitle}
			<div class="node-buttons flex items-center">
				{#if issues.length}
					<div
						class="tooltip tooltip-bottom flex items-center before:z-50 before:whitespace-pre-line"
						data-tip={issueTooltip}
					>
						<span
							class={[
								'badge badge-xs mr-1 gap-0.5 border-0 text-white',
								errorIssues.length ? 'bg-red-600' : 'bg-amber-500'
							]}
						>
							{#if errorIssues.length}
								<LucideCircleAlert class="size-3" />
								{errorIssues.length}
							{:else}
								<LucideAlertTriangle class="size-3" />
								{warningIssues.length}
							{/if}
							{#if errorIssues.length && warningIssues.length}
								<span class="text-amber-200">+{warningIssues.length}</span>
							{/if}
						</span>
					</div>
				{/if}
				{#if status === PipelineExecutionStatusEnum.FAILED && pipelineExecution}
					<div class="tooltip tooltip-bottom" data-tip="Ab hier erneut ausführen">
						<button
							onclick={retryFromHere}
							disabled={retrying}
							class="btn btn-xs btn-ghost aspect-square h-[32px] w-auto rounded-none p-0 hover:bg-white/40"
						>
							{#if retrying}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<LucideRotateCcw />
							{/if}
						</button>
					</div>
				{/if}
				<button
					onclick={(e) => (executionData ? viewNodeExecutionInfoModal(e) : editNode(e))}
					class="btn btn-xs btn-ghost rounded-tr-box aspect-square h-[32px] w-auto rounded-none p-0 hover:bg-white/40"
				>
					{#if executionData}
						<LucideFileText />
					{:else if editorContext.allowEdit}
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
	{#if hasProgress && !enlargedTitle && progress}
		<div class="flex w-full max-w-72 min-w-48 flex-col gap-0.5 px-2 pt-1 text-xs">
			{#if progressPercent !== undefined}
				<progress
					class="progress h-1 w-full {status === PipelineExecutionStatusEnum.FAILED
						? 'progress-error'
						: status === PipelineExecutionStatusEnum.SUCCESS
							? 'progress-success'
							: 'progress-primary'}"
					value={progressPercent}
					max="100"
				></progress>
			{:else if running}
				<progress class="progress progress-primary h-1 w-full"></progress>
			{/if}
			{#if progressCounts || progressPercent !== undefined}
				<span class="text-base-content/70 tabular-nums">
					{progressCounts}{progressPercent !== undefined && progressCounts
						? ` (${progressPercent} %)`
						: progressPercent !== undefined
							? `${progressPercent} %`
							: ''}
				</span>
			{/if}
			{#if progress.message}
				<span class="text-base-content/70 truncate" title={progress.message}>
					{progress.message}
				</span>
			{/if}
		</div>
	{/if}
	<div class="node-handles flex flex-row justify-between gap-2">
		<div class="relative flex flex-col">
			{#each getHandles('input', module.inputTypeSchema) as [handleName, handleType], i (handleName)}
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
			{#each getHandles('output', module.outputTypeSchema) as [handleName, handleType], i (handleName)}
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
	.running-ring {
		animation: running-ring 1.6s ease-in-out infinite;
	}

	@keyframes running-ring {
		0%,
		100% {
			box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-primary) 45%, transparent);
		}
		50% {
			box-shadow: 0 0 0 6px color-mix(in oklab, var(--color-primary) 0%, transparent);
		}
	}

	.node-handles {
		height: calc(var(--handle-height) * var(--max-handle-amount));
	}

	.node-header {
		background:
			linear-gradient(200deg, rgba(255, 255, 255, 0.4), transparent 100%),
			linear-gradient(0deg, var(--bg-color), var(--bg-color));
		color: var(--fg-color);
	}

	.node-buttons button:hover {
		border-color: var(--bg-color) !important;
	}
</style>

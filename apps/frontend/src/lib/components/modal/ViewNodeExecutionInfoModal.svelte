<script lang="ts">
	import type { ModalProps } from '$lib/components/modal/modalRegistry.js';
	import type { ModalTypeEnum } from '$lib/components/modal/modalTypeEnum.js';
	import { Dialog } from 'bits-ui';
	import type {
		BlueprintNodeDto,
		PipelineExecutionDataDto,
		PipelineExecutionLogDto,
		PipelineModuleDto
	} from '@bytebunker/backend';
	import { deconstructPipelineModuleIdentifier } from '@bytebunker/backend';
	import { toHeaderCase } from 'js-convert-case';
	import PipelineStatusBadge from '$lib/components/pipeline/PipelineStatusBadge.svelte';
	import CodeEditor from '$lib/components/monaco/CodeEditor.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import type { FindAllDto } from '@bytebunker/backend';
	import { PipelineExecutionStatusEnum } from '@bytebunker/backend';
	import { PipelineExecutionLogApi } from '$lib/api/PipelineExecutionLogApi.js';
	import { DateTime } from 'luxon';
	import { PipelineApi } from '$lib/api/PipelineApi.js';
	import {
		isTerminalStatus,
		pipelineProgressQueryKey
	} from '$lib/components/pipeline/execution/pipelineProgress.svelte.js';

	let { options }: ModalProps<ModalTypeEnum.VIEW_NODE_EXECUTION_INFO> = $props();

	let node = $derived<BlueprintNodeDto>(options.blueprintNode);
	let module = $derived<PipelineModuleDto>(options.module);
	let executionData = $derived<PipelineExecutionDataDto>(options.executionData);
	let executionId = $derived(options.executionData.pipelineExecution.id);

	// The page keeps this query up to date from the SSE stream; the interval is only a fallback
	// while the modal is open on a running execution.
	const progressQuery = createQuery(() => ({
		queryKey: pipelineProgressQueryKey(executionId),
		queryFn: () => PipelineApi.getProgress(executionId),
		refetchInterval: (query) => (isTerminalStatus(query.state.data?.executionStatus) ? false : 5000)
	}));

	let nodeProgress = $derived(progressQuery.data?.nodes.find((n) => n.nodeId === node.id));
	let status = $derived(
		(nodeProgress?.status ?? executionData.executionStatus) as PipelineExecutionStatusEnum
	);
	let percent = $derived(
		nodeProgress?.fraction === undefined ? undefined : Math.round(nodeProgress.fraction * 100)
	);

	// Load only this node's output; a full execution can be tens of megabytes.
	const nodeDataQuery = createQuery(() => ({
		queryKey: ['pipeline-node-data', executionId, node.id, status],
		queryFn: () => PipelineApi.findNodeData(executionId, node.id),
		staleTime: 5 * 60 * 1000
	}));

	let outputData = $derived(nodeDataQuery.data?.data);
	let moduleId = $derived(deconstructPipelineModuleIdentifier(node.moduleId));

	const pipelineExecutionLogsQuery = createQuery(() => ({
		queryKey: [
			'pipeline-execution-log',
			executionId,
			{
				where: {
					nodeId: node.id
				}
			} satisfies FindAllDto<PipelineExecutionLogDto>
		] as const,
		queryFn: ({ queryKey }) => PipelineExecutionLogApi.findAll(executionId, queryKey[2]),
		refetchInterval: () => (isTerminalStatus(progressQuery.data?.executionStatus) ? false : 5000)
	}));

	/** Shortens long arrays so the editor stays responsive. */
	function reduceDataSize(data: Record<string, unknown>): Record<string, unknown> {
		const reduced: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(data)) {
			reduced[key] =
				Array.isArray(value) && value.length > 50
					? [...value.slice(0, 50), `… ${value.length - 50} weitere Einträge nicht angezeigt`]
					: value;
		}

		return reduced;
	}
</script>

<div class="flex flex-col gap-4 p-3">
	<Dialog.Title class=" text-lg font-semibold tracking-tight"
		>{toHeaderCase(moduleId.moduleName)}
	</Dialog.Title>
	<div class="flex items-center gap-2">
		Ausführung Status:
		<PipelineStatusBadge {status} />
	</div>
	{#if nodeProgress && (nodeProgress.message || percent !== undefined || nodeProgress.current !== undefined)}
		<div class="flex flex-col gap-1 text-sm">
			{#if percent !== undefined}
				<progress class="progress progress-primary h-2 w-full" value={percent} max="100"></progress>
			{:else if (status as string) === 'running'}
				<progress class="progress progress-primary h-2 w-full"></progress>
			{/if}
			<div class="text-base-content/70 flex justify-between gap-2">
				<span>{nodeProgress.message ?? ''}</span>
				<span class="tabular-nums">
					{#if nodeProgress.current !== undefined}
						{nodeProgress.current.toLocaleString('de-DE')}{nodeProgress.total !== undefined
							? ` / ${nodeProgress.total.toLocaleString('de-DE')}`
							: ''}
						{nodeProgress.unit ?? ''}
					{/if}
					{#if percent !== undefined}({percent} %){/if}
				</span>
			</div>
		</div>
	{/if}

	<label class="form-control flex w-full flex-col">
		<div class="label">
			<span class="label-text">Ausgabedaten</span>
		</div>
		{#if nodeDataQuery.isPending}
			<span class="loading loading-spinner loading-sm"></span>
		{:else if nodeDataQuery.isError}
			<span class="text-error text-sm">Ausgabedaten konnten nicht geladen werden.</span>
		{:else if outputData}
			<CodeEditor
				class="input h-[50vh] w-full !outline-transparent"
				value={JSON.stringify(reduceDataSize($state.snapshot(outputData)), null, 4).slice(0, 5000)}
				language="json"
				jsonSchema={module.outputTypeSchema?.jsonSchema}
				readOnly
			/>
		{:else}
			Keine Daten vorhanden
		{/if}
	</label>

	<label class="form-control flex w-full flex-col">
		<div class="label">
			<span class="label-text">Ausführungslogs</span>
		</div>

		{#if pipelineExecutionLogsQuery.data?.length}
			<div class="join join-vertical bg-base-100">
				{#each pipelineExecutionLogsQuery.data as log, i}
					<div class="collapse-arrow join-item border-base-300 collapse overflow-hidden border">
						<input type="radio" name="execution-log-radio" checked={i === 0} />
						<div class="collapse-title w-fit font-semibold">
							<div class="flex gap-4">
								<span
									>{log.message?.slice(0, 50)}{(log.message?.length ?? 0) > 50 ? '...' : ''}</span
								>
								<span class="text-neutral-500"
									>{log.createdAt.toLocaleString(DateTime.DATETIME_SHORT)}</span
								>
							</div>
						</div>
						<div class="collapse-content text-sm">
							<pre><code>{JSON.stringify(log.data, null, 2).slice(0, 5000)}</code></pre>
						</div>
					</div>
				{/each}
			</div>

			<!--<div class="w-full">
                    <div class="collapse-arrow bg-base-200 collapse mb-2">
                        <input type="checkbox" />
                        <div class="collapse-title text-xl font-medium">
                            Log ID: {log.id}
                        </div>
                        <div class="collapse-content">
                            <table class="table w-full">
                                <tbody>
                                    <tr>
                                        <td class="font-bold">Message</td>
                                        <td>{log.message}</td>
                                    </tr>
                                    <tr>
                                        <td class="font-bold">Status Code</td>
                                        <td>{log.data?.statusCode}</td>
                                    </tr>
                                    <tr>
                                        <td class="font-bold">Data</td>
                                        <td>{log.data?.data}</td>
                                    </tr>
                                    <tr>
                                        <td class="font-bold">Error</td>
                                        <td>{log.data?.error}</td>
                                    </tr>
                                    <tr>
                                        <td class="font-bold">Time</td>
                                        <td>{log.createdAt}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
            </div>-->
		{:else}
			<div class="py-4 text-center">Keine Daten vorhanden</div>
		{/if}
	</label>
</div>

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
	import { PipelineExecutionLogApi } from '$lib/api/PipelineExecutionLogApi.js';
	import { DateTime } from 'luxon';

	let { options }: ModalProps<ModalTypeEnum.VIEW_NODE_EXECUTION_INFO> = $props();
	console.log('options', options);

	let node = $derived<BlueprintNodeDto>(options.blueprintNode);
	let module = $derived<PipelineModuleDto>(options.module);
	let executionData = $derived<PipelineExecutionDataDto>(options.executionData);
	let moduleId = $derived(deconstructPipelineModuleIdentifier(node.moduleId));

	const pipelineExecutionLogsQuery = createQuery(() => ({
		queryKey: [
			'pipeline-execution-log',
			{
				where: {
					nodeId: node.id
				}
			} satisfies FindAllDto<PipelineExecutionLogDto>
		],
		queryFn: ({ queryKey }) =>
			PipelineExecutionLogApi.findAll(options.executionData.pipelineExecution.id, queryKey[1])
	}));

	function reduceDataSize(executionData: Record<string, unknown>): Record<string, unknown> {
		for (const [key, value] of Object.entries(executionData)) {
			if (Array.isArray(value) && value.length > 50) {
				console.log('found array with len', value.length);
				executionData[key] = value.slice(0, 50).push('Data reduced to prevent lag');
			}
		}

		return executionData;
	}
</script>

<div class="flex flex-col gap-4 p-3">
	<Dialog.Title class=" text-lg font-semibold tracking-tight"
		>{toHeaderCase(moduleId.moduleName)}
	</Dialog.Title>
	<div class="flex items-center gap-2">
		Ausführung Status:
		<PipelineStatusBadge status={executionData.executionStatus} />
	</div>

	<label class="form-control flex w-full flex-col">
		<div class="label">
			<span class="label-text">Ausgabedaten</span>
		</div>
		{#if executionData.data}
			<CodeEditor
				class="input h-[50vh] w-full !outline-transparent"
				value={JSON.stringify(reduceDataSize($state.snapshot(executionData.data)), null, 4).slice(
					0,
					5000
				)}
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
						<input type="radio" name="execution-log-radio" checked={i === 0 ? 'checked' : ''} />
						<div class="collapse-title w-fit font-semibold">
							<div class="flex gap-4">
								<span>{log.message?.slice(0, 50)}{log.message?.length > 50 ? '...' : ''}</span>
								<span class="text-neutral-500"
									>{DateTime.fromISO(log.createdAt).toLocaleString(DateTime.DATETIME_SHORT)}</span
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

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

	let { options }: ModalProps<ModalTypeEnum.VIEW_NODE_EXECUTION_INFO> = $props();
	console.log('options', options);

	let node = $derived<BlueprintNodeDto>(options.blueprintNode);
	let module = $derived<PipelineModuleDto>(options.module);
	let executionData = $derived<PipelineExecutionDataDto>(options.executionData);
	let executionLogs = $derived<PipelineExecutionLogDto[]>(options.executionLogs);
	let moduleId = $derived(deconstructPipelineModuleIdentifier(node.moduleId));

	// TODO: Load execution logs
	/*const pipelineExecutionLogsQuery = createQuery(() => ({
		queryKey: [
			'pipeline-execution-log',
			{} satisfies FindAllDto<PipelineExecutionLogDto>
		],
		queryFn: ({ queryKey }) => PipExA.findOne(queryKey[1])
	}));*/
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
				value={JSON.stringify(executionData.data, null, 4)}
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

		{#if executionLogs.length}
			<div class="overflow-x-auto">
				<table class="table-xs table">
					<thead>
						<tr>
							<th></th>
							<th>Message</th>
							<th>Status Code</th>
							<th>Data</th>
							<th>Error</th>
							<th>Time</th>
						</tr>
					</thead>
					<tbody>
						{#each executionLogs as log}
							<tr>
								<th>{log.id}</th>
								<td>{log.message}</td>
								<td>{log.data?.statusCode}</td>
								<td>{log.data?.data}</td>
								<td>{log.data?.error}</td>
								<td>{log.createdAt}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			Keine Daten vorhanden
		{/if}
	</label>
</div>

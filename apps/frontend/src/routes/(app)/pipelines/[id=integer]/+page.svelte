<script lang="ts">
	import BlueprintEditor from '$lib/components/pipeline/BlueprintEditor.svelte';
	import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import LucideCircuitBoard from '~icons/lucide/circuit-board';
	import LucideRefreshCcw from '~icons/lucide/refresh-ccw';
	import LucideCheckCheck from '~icons/lucide/check-check';
	import LucideFlaskConical from '~icons/lucide/flask-conical';
	import ToolbarButton from '$lib/components/ToolbarButton.svelte';
	import type { FindOneDto, StoreActivityReport } from '@bytebunker/backend';
	import LucideWorkflow from '~icons/lucide/workflow';
	import { Blueprint } from '@bytebunker/backend';
	import type { PipelineExecutionDto } from '@bytebunker/backend';
	import { PipelineApi } from '$lib/api/PipelineApi.js';
	import { toastManager } from '$lib/util/toastManager.svelte.js';
	import {
		createPipelineProgress,
		isTerminalStatus
	} from '$lib/components/pipeline/execution/pipelineProgress.svelte.js';
	import ExecutionProgressBar from '$lib/components/pipeline/execution/ExecutionProgressBar.svelte';
	import ImportReportPanel from '$lib/components/pipeline/execution/ImportReportPanel.svelte';
	import { PipelineExecutionStatusEnum } from '@bytebunker/backend';

	const STORE_ACTIVITY_MODULE_ID = 'bytebunker-core:store-activity@1';

	const queryClient = useQueryClient();
	let executionId = $derived(Number(page.params.id));

	const pipelineExecutionQuery = createQuery(() => ({
		queryKey: [
			'pipeline',
			executionId,
			{
				populate: ['blueprint', 'executionData'],
				// Node outputs can be tens of megabytes; they are loaded lazily per node
				exclude: ['executionData.data']
			} satisfies FindOneDto<
				PipelineExecutionDto,
				'blueprint' | 'executionData',
				'*',
				'executionData.data'
			>
		] as const,
		queryFn: ({ queryKey }) => PipelineApi.findOne(Number(queryKey[1]), queryKey[2]),
		refetchInterval: 30 * 1000
	}));

	let execution = $derived(pipelineExecutionQuery.data);

	const progressStream = createPipelineProgress({
		executionId: () => executionId,
		live: () => !execution || !isTerminalStatus(execution.executionStatus),
		onEnd: () => queryClient.invalidateQueries({ queryKey: ['pipeline', executionId] })
	});

	let blueprint = $derived(
		execution ? new Blueprint($state.snapshot(execution.blueprint.data)) : undefined
	);

	let dryRun = $derived(progressStream.progress?.dryRun ?? execution?.dryRun ?? false);

	// The store node's output holds the import report
	let storeNodeId = $derived(
		blueprint?.getNodes().find((n) => n.moduleId === STORE_ACTIVITY_MODULE_ID)?.id
	);
	let storeNodeSucceeded = $derived(
		execution?.executionData.some(
			(d) => d.nodeId === storeNodeId && d.executionStatus === PipelineExecutionStatusEnum.SUCCESS
		) ?? false
	);

	const storeReportQuery = createQuery(() => ({
		queryKey: ['pipeline-store-report', executionId, storeNodeId],
		queryFn: () => PipelineApi.findNodeData(executionId, storeNodeId!),
		enabled: storeNodeId !== undefined && storeNodeSucceeded,
		staleTime: 5 * 60 * 1000
	}));

	let report = $derived(
		(storeReportQuery.data?.data as { report?: StoreActivityReport } | undefined)?.report
	);

	const scheduleExecutionMutation = createMutation(() => ({
		mutationFn: (id: number) => PipelineApi.scheduleExecution(id)
	}));

	const applyMutation = createMutation(() => ({
		mutationFn: (id: number) => PipelineApi.applyDryRun(id)
	}));

	const dryRunMutation = createMutation(() => ({
		mutationFn: (id: number) => PipelineApi.dryRun(id)
	}));

	async function scheduleExecution() {
		await scheduleExecutionMutation.mutateAsync(executionId);

		toastManager.showSuccess('Ausführung wurde erneut eingeplant');
		await queryClient.invalidateQueries({ queryKey: ['pipeline', executionId] });
	}

	async function apply() {
		try {
			const created = await applyMutation.mutateAsync(executionId);
			toastManager.showSuccess('Import wird angewendet');
			await goto(`/pipelines/${created.id}`);
		} catch (e) {
			toastManager.showError(
				`Anwenden fehlgeschlagen${e instanceof Error ? `: ${e.message}` : ''}`
			);
		}
	}

	async function repeatAsDryRun() {
		try {
			const created = await dryRunMutation.mutateAsync(executionId);
			toastManager.showSuccess('Dry Run gestartet');
			await goto(`/pipelines/${created.id}`);
		} catch (e) {
			toastManager.showError(`Dry Run fehlgeschlagen${e instanceof Error ? `: ${e.message}` : ''}`);
		}
	}
</script>

<svelte:head>
	<title>Blueprints</title>
</svelte:head>

<MainLayout
	icon={LucideWorkflow}
	title="{execution?.blueprint.title} Pipeline"
	breadcrumbs={[['Pipelines', '/pipelines']]}
>
	{#snippet toolbar()}
		<ToolbarButton
			icon={LucideCircuitBoard}
			tooltip="Zum Blueprint"
			href="/pipelines/blueprints/{execution?.blueprint.id}"
		/>
		{#if dryRun}
			<ToolbarButton
				icon={LucideCheckCheck}
				class="btn-success"
				tooltip="Anwenden"
				onclick={apply}
				loading={applyMutation.isPending}
			/>
		{:else}
			<ToolbarButton
				icon={LucideFlaskConical}
				tooltip="Als Dry Run wiederholen"
				onclick={repeatAsDryRun}
				loading={dryRunMutation.isPending}
			/>
		{/if}
		<ToolbarButton
			icon={LucideRefreshCcw}
			tooltip="Ausführung erneut starten"
			onclick={scheduleExecution}
		/>
	{/snippet}

	{#if blueprint && execution}
		<div class="flex flex-col gap-4">
			<ExecutionProgressBar {execution} progress={progressStream.progress} />
			<BlueprintEditor
				{blueprint}
				pipelineExecution={execution}
				allowEdit={false}
				nodeProgress={progressStream.nodeProgress}
			/>
			{#if report}
				<ImportReportPanel {report} {executionId} {dryRun} />
			{/if}
		</div>
	{/if}
</MainLayout>

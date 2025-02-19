<script lang="ts">
	import BlueprintEditor from '$lib/components/pipeline/BlueprintEditor.svelte';
	import { createMutation, createQuery } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import LucideCircuitBoard from '~icons/lucide/circuit-board';
	import LucideRefreshCcw from '~icons/lucide/refresh-ccw';
	import ToolbarButton from '$lib/components/ToolbarButton.svelte';
	import type { FindOneDto } from '@bytebunker/backend';
	import LucideWorkflow from '~icons/lucide/workflow';
	import { Blueprint } from '@bytebunker/backend';
	import type { PipelineExecutionDto } from '@bytebunker/backend';
	import { PipelineApi } from '$lib/api/PipelineApi.js';
	import { toastManager } from '$lib/util/toastManager.svelte.js';

	const pipelineExecutionQuery = createQuery(() => ({
		queryKey: [
			'pipeline',
			Number(page.params.id),
			{
				populate: ['blueprint', 'executionData']
			} satisfies FindOneDto<PipelineExecutionDto>
		],
		queryFn: ({ queryKey }) => PipelineApi.findOne(Number(queryKey[1]), queryKey[2]),
		refetchInterval: 30 * 1000
	}));

	let blueprint = $derived(
		pipelineExecutionQuery.data
			? new Blueprint($state.snapshot(pipelineExecutionQuery.data.blueprint.data))
			: undefined
	);

	const scheduleExecutionMutation = createMutation(() => ({
		mutationFn: (id: number) => PipelineApi.scheduleExecution(id)
	}));

	async function scheduleExecution() {
		await scheduleExecutionMutation.mutateAsync(Number(page.params.id));

		toastManager.showSuccess('Scheduled pipeline to re-execute');
	}
</script>

<svelte:head>
	<title>Blueprints</title>
</svelte:head>

<MainLayout
	icon={LucideWorkflow}
	title="{pipelineExecutionQuery.data?.blueprint.title} Pipeline"
	breadcrumbs={[['Pipelines', '/pipelines']]}
>
	{#snippet toolbar()}
		<ToolbarButton
			icon={LucideCircuitBoard}
			tooltip="Zum Blueprint"
			href="/pipelines/blueprints/{pipelineExecutionQuery.data?.blueprint.id}"
		/>
		<ToolbarButton
			icon={LucideRefreshCcw}
			tooltip="Ausführung erneut starten"
			onclick={scheduleExecution}
		/>
		<!--<ToolbarButton
            icon={LucideSave}
            class="btn-success"
            tooltip="Änderungen speichern"
            onclick={saveBlueprint}
            loading={updateBlueprintMutation.isPending}
        />-->
	{/snippet}

	{#if blueprint && pipelineExecutionQuery.data}
		<BlueprintEditor
			{blueprint}
			pipelineExecution={pipelineExecutionQuery.data}
			allowEdit={false}
		/>
	{/if}
</MainLayout>

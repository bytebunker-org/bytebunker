<script lang="ts">
	import BlueprintEditor from '$lib/components/pipeline/BlueprintEditor.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import LucideCircuitBoard from '~icons/lucide/circuit-board';
	import ToolbarButton from '$lib/components/ToolbarButton.svelte';
	import type { FindOneDto } from '@bytebunker/backend';
	import LucideWorkflow from '~icons/lucide/workflow';
	import { Blueprint } from '@bytebunker/backend';
	import type { PipelineExecutionDto } from '@bytebunker/backend';
	import { PipelineApi } from '$lib/api/PipelineApi.js';

	const pipelineExecutionQuery = createQuery(() => ({
		queryKey: [
			'pipeline',
			Number(page.params.id),
			{
				populate: ['blueprint', 'executionData']
			} satisfies FindOneDto<PipelineExecutionDto>
		],
		queryFn: ({ queryKey }) => PipelineApi.findOne(Number(queryKey[1]), queryKey[2])
	}));

	let blueprint = $derived(
		pipelineExecutionQuery.data
			? new Blueprint($state.snapshot(pipelineExecutionQuery.data.blueprint.data))
			: undefined
	);
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

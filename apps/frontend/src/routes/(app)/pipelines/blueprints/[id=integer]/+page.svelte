<script lang="ts">
	import { Card, CardBody } from '@bytebunker/daisyui-components';
	import BlueprintEditor from '$lib/components/pipeline/BlueprintEditor.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import { PipelineBlueprintApi } from '$lib/api/PipelineBlueprintApi.js';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import LucideCircuitBoard from '~icons/lucide/circuit-board';
	import ToolbarButton from '$lib/components/ToolbarButton.svelte';
	import type { FindOneDto, PipelineBlueprintDto } from '@bytebunker/backend';
	import { Blueprint } from '@bytebunker/backend';

	const blueprintQuery = createQuery(() => ({
		queryKey: [
			'pipeline-blueprint',
			Number(page.params.id),
			{} satisfies FindOneDto<PipelineBlueprintDto>
		],
		queryFn: ({ queryKey }) => PipelineBlueprintApi.findOne(Number(queryKey[1]), queryKey[2])
	}));

	let blueprint = $derived(
		blueprintQuery.data ? new Blueprint(blueprintQuery.data.data) : undefined
	);
</script>

<svelte:head>
	<title>Blueprints</title>
</svelte:head>

<MainLayout
	icon={LucideCircuitBoard}
	title="{blueprintQuery.data?.title} Blueprint"
	breadcrumbs={[
		['Pipelines', '/pipelines'],
		['Blueprints', '/pipelines/blueprints']
	]}
>
	{#snippet toolbar()}
		<ToolbarButton icon={LucideCircuitBoard} tooltip="Blueprint bearbeiten"></ToolbarButton>
	{/snippet}

	<BlueprintEditor {blueprint} />
</MainLayout>

<script lang="ts">
	import { Blueprint } from '@bytebunker/backend';
	import { createQuery } from '@tanstack/svelte-query';
	import { groupByKeySingle } from '$lib/util/util.js';
	import type { PipelineModuleDto } from '@bytebunker/backend';
	import type { FindAllDto } from '@bytebunker/backend';
	import { PipelineModuleApi } from '$lib/api/PipelineModuleApi.js';
	import { setBlueprintEditorContext } from '$lib/components/pipeline/blueprintContext.js';
	import BlueprintEditorFlow from '$lib/components/pipeline/BlueprintEditorFlow.svelte';
	import { blur } from 'svelte/transition';
	import BlueprintEditorToolbox from '$lib/components/pipeline/BlueprintEditorToolbox.svelte';
	import { Card, CardBody } from '@bytebunker/daisyui-components';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import type { PipelineExecutionDto } from '@bytebunker/backend';
	import { enumValues, PipelineExecutionStatusEnum } from '@bytebunker/backend';
	import PipelineStatusBadge from '$lib/components/pipeline/PipelineStatusBadge.svelte';
	import { browser } from '$app/environment';

	interface Props {
		blueprint: Blueprint;

		pipelineExecution?: PipelineExecutionDto;

		allowEdit?: boolean;
	}

	let { blueprint, pipelineExecution, allowEdit = true }: Props = $props();

	const pipelineModulesQuery = createQuery<
		PipelineModuleDto[],
		Error,
		PipelineModuleDto[],
		[string, FindAllDto<PipelineModuleDto>]
	>(() => ({
		queryKey: [
			'pipeline-modules',
			{
				populate: ['extension', 'inputTypeSchema', 'outputTypeSchema']
			} as unknown as FindAllDto<PipelineModuleDto>
		],
		queryFn: ({ queryKey }) => PipelineModuleApi.findAll(queryKey[1]),
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000
	}));

	let pipelineModules = $derived(
		pipelineModulesQuery.data ? groupByKeySingle(pipelineModulesQuery.data, 'id') : undefined
	);

	setBlueprintEditorContext(() => ({
		blueprint,
		// All children of the blueprint are only rendered when everything is loaded
		pipelineModules: pipelineModules!,
		pipelineExecution,
		allowEdit
	}));
</script>

<div class="flex flex-col gap-4">
	<Card class="bg-base-100 border-base-300 rounded-box border shadow">
		<CardBody class="overflow-hidden p-0">
			<div style:height="500px" class="rounded-box relative overflow-hidden">
				{#if browser && blueprint && pipelineModules}
					<SvelteFlowProvider>
						<BlueprintEditorFlow />
					</SvelteFlowProvider>
				{:else}
					<div
						class="bg-base-100 absolute inset-0 z-20 flex w-full items-center justify-center"
						transition:blur={{ duration: 300 }}
					>
						<span class="loading loading-ring text-primary size-16"></span>
					</div>
				{/if}
			</div>
		</CardBody>
	</Card>
	{#if pipelineExecution}
		<div class="rounded-box flex w-fit flex-col bg-neutral-100 p-2">
			<p class="mb-1 text-sm font-bold">Ausführungsstatus</p>
			<div class="flex flex-wrap gap-1">
				{#each enumValues(PipelineExecutionStatusEnum) as status}
					<PipelineStatusBadge {status} />
				{/each}
			</div>
		</div>
	{/if}

	{#if allowEdit}
		<BlueprintEditorToolbox />
	{/if}
</div>

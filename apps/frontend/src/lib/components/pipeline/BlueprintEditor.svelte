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

	interface Props {
		blueprint: Blueprint;

		allowEdit?: boolean;
	}

	let { blueprint, allowEdit = true }: Props = $props();

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
		pipelineModules: pipelineModules!
	}));
</script>

<SvelteFlowProvider>
	<div class="flex flex-col gap-4">
		<Card class="bg-base-100 border-base-300 rounded-box border shadow">
			<CardBody class="overflow-hidden p-0">
				<div style:height="500px" class="rounded-box relative overflow-hidden">
					{#if blueprint && pipelineModules}
						<BlueprintEditorFlow />
					{:else}
						<div
							class="bg-base-100 absolute inset-0 z-20 flex w-full items-center justify-center"
							transition:blur={{ duration: 300 }}
						>
							<span class="loading loading-ring text-primary size-12"></span>
						</div>
					{/if}
				</div>
			</CardBody>
		</Card>

		{#if allowEdit && pipelineModules}
			<BlueprintEditorToolbox />
		{/if}
	</div>
</SvelteFlowProvider>

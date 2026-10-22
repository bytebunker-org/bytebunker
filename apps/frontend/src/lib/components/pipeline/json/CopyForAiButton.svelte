<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { FindAllDto, PipelineModuleDto } from '@bytebunker/backend';
	import { PipelineModuleApi } from '$lib/api/PipelineModuleApi.js';
	import ToolbarButton from '$lib/components/ToolbarButton.svelte';
	import LucideSparkles from '~icons/lucide/sparkles';
	import { buildBlueprintAiCatalog } from '$lib/components/pipeline/json/blueprintAiCatalog.js';
	import { toastManager } from '$lib/util/toastManager.svelte.js';

	// Same key as the blueprint editor, so the modules are only fetched once.
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

	async function copy() {
		if (!pipelineModulesQuery.data) {
			toastManager.showError('Module sind noch nicht geladen!');

			return;
		}

		try {
			await navigator.clipboard.writeText(buildBlueprintAiCatalog(pipelineModulesQuery.data));
			toastManager.showSuccess('Modulkatalog für KI wurde kopiert');
		} catch (error) {
			console.error(error);
			toastManager.showError('Modulkatalog konnte nicht kopiert werden!');
		}
	}
</script>

<ToolbarButton
	icon={LucideSparkles}
	tooltip="Für KI kopieren (Modulkatalog + Format)"
	onclick={copy}
	loading={pipelineModulesQuery.isPending}
/>

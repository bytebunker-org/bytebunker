<script lang="ts">
	import { Card, CardBody } from '@bytebunker/daisyui-components';
	import type { DataTableConfig } from 'svelte-advanced-datatable';
	import { ComponentType } from 'svelte-advanced-datatable';
	import { DataTable } from 'svelte-advanced-datatable/daisyUi';
	import { AdvancedSearchParser } from 'svelte-advanced-datatable/searchParser';
	import { SvelteQueryDataSource } from 'svelte-advanced-datatable/dataSource/svelteQuery';
	import { goto } from '$app/navigation';
	import { DateTime } from 'luxon';
	import type { PipelineBlueprintDatatableDto } from '@bytebunker/backend';
	import { PipelineBlueprintApi } from '$lib/api/PipelineBlueprintApi.js';
	import { FilterQueryUtil } from '$lib/util/filterQueryUtil.svelte.js';
	import { pipelineBlueprintFilterDefinition } from './pipelineBlueprintFilterDefinition.js';
	import { format } from 'svelte-i18n';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import ToolbarButton from '$lib/components/ToolbarButton.svelte';
	import LucideCircuitBoard from '~icons/lucide/circuit-board';
	import LucideFileJson from '~icons/lucide/file-json';
	import { createMutation, useQueryClient } from '@tanstack/svelte-query';
	import type { PipelineBlueprintDto } from '@bytebunker/backend';
	import BlueprintJsonImportDialog from '$lib/components/pipeline/json/BlueprintJsonImportDialog.svelte';
	import CopyForAiButton from '$lib/components/pipeline/json/CopyForAiButton.svelte';
	import type { ParsedBlueprintJson } from '$lib/components/pipeline/json/blueprintJson.js';
	import { toastManager } from '$lib/util/toastManager.svelte.js';

	const queryClient = useQueryClient();

	let importOpen = $state(false);

	const createBlueprintMutation = createMutation<
		PipelineBlueprintDto,
		Error,
		ParsedBlueprintJson & { title?: string }
	>(() => ({
		mutationFn: (value) =>
			PipelineBlueprintApi.create({
				title: value.title ?? 'Neuer Blueprint',
				description: value.description,
				data: value.data
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline-blueprint'] })
	}));

	async function createFromJson(value: ParsedBlueprintJson & { title?: string }) {
		try {
			const created = await createBlueprintMutation.mutateAsync(value);

			toastManager.showSuccess('Blueprint wurde erstellt');
			await goto(`/pipelines/blueprints/${created.id}`);
		} catch (error) {
			console.error(error);
			toastManager.showError('Blueprint konnte nicht erstellt werden!');

			// keep the dialog open so the pasted JSON is not lost
			throw error;
		}
	}

	type ListEntry = PipelineBlueprintDatatableDto;

	const filter = new FilterQueryUtil(pipelineBlueprintFilterDefinition);

	const dataSource = new SvelteQueryDataSource<ListEntry>(
		(data) => PipelineBlueprintApi.findAllDatatable(data),
		{
			gcTime: 60 * 1000,
			staleTime: 60 * 1000
		}
	);

	const config = {
		type: 'pipeline-blueprint',
		columnProperties: {
			id: {
				type: ComponentType.NUMBER,
				sortable: false,
				hidden: true
			},
			title: {
				type: ComponentType.STRING,
				sortable: false
			},
			description: {
				type: ComponentType.STRING,
				sortable: false
			},
			createdAt: {
				type: ComponentType.DATE,
				sortable: false,
				dateFormat: DateTime.DATETIME_SHORT
			},
			updatedAt: {
				type: ComponentType.DATE,
				sortable: false,
				hidden: true,
				dateFormat: DateTime.DATETIME_SHORT
			}
		},
		dataUniquePropertyKey: 'id',
		messageFormatter: format,
		searchParser: new AdvancedSearchParser(),
		onItemClick: (item: PipelineBlueprintDatatableDto) => goto(`/pipelines/blueprints/${item.id}`)
	} satisfies DataTableConfig<PipelineBlueprintDatatableDto>;
</script>

<MainLayout
	icon={LucideCircuitBoard}
	title="Blueprints"
	breadcrumbs={[['Pipelines', '/pipelines']]}
>
	{#snippet toolbar()}
		<CopyForAiButton />
		<ToolbarButton
			icon={LucideFileJson}
			tooltip="Blueprint aus JSON erstellen"
			class="btn-success"
			onclick={() => (importOpen = true)}
		/>
	{/snippet}
	<Card class="bg-base-100 border-base-300 rounded-box border shadow">
		<CardBody class="overflow-hidden p-4 pb-8">
			<DataTable {config} {dataSource} striped hoverable />
		</CardBody>
	</Card>
</MainLayout>

<BlueprintJsonImportDialog bind:open={importOpen} mode="create" onsubmit={createFromJson} />

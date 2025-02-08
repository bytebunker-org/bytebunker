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
	import LucidePlus from '~icons/lucide/plus';

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
		<ToolbarButton icon={LucidePlus} tooltip="Blueprint erstellen" class="btn-success" />
	{/snippet}
	<Card class="bg-base-100 border-base-300 rounded-box border shadow">
		<CardBody class="overflow-hidden p-4 pb-8">
			<DataTable {config} {dataSource} striped hoverable />
		</CardBody>
	</Card>
</MainLayout>

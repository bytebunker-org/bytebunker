<script lang="ts">
	import { Card, CardBody } from '@bytebunker/daisyui-components';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import LucideWorkflow from '~icons/lucide/workflow';
	import LucidePlus from '~icons/lucide/plus';
	import ToolbarButton from '$lib/components/ToolbarButton.svelte';
	import { DataTable } from 'svelte-advanced-datatable/daisyUi';
	import { AdvancedSearchParser } from 'svelte-advanced-datatable/searchParser';
	import { SvelteQueryDataSource } from 'svelte-advanced-datatable/dataSource/svelteQuery';
	import {
		ComponentType,
		type DataTableConfig,
		type EnumComponentTypeProperties
	} from 'svelte-advanced-datatable';
	import { DateTime } from 'luxon';
	import { format } from 'svelte-i18n';
	import type { PipelineExecutionDatatableDto } from '@bytebunker/backend';
	import { goto } from '$app/navigation';
	import { PipelineApi } from '$lib/api/PipelineApi.js';
	import { pipelineFilterDefinition } from './pipelineFilterDefinition.js';
	import { FilterQueryUtil } from '$lib/util/filterQueryUtil.svelte.js';
	import { PipelineExecutionStatusEnum } from '@bytebunker/backend';
	import { enumValues } from '@bytebunker/backend';

	type ListEntry = PipelineExecutionDatatableDto;

	const filter = new FilterQueryUtil(pipelineFilterDefinition);

	const dataSource = new SvelteQueryDataSource<ListEntry>(
		(data) => PipelineApi.findAllDatatable(data),
		{
			gcTime: 60 * 1000,
			staleTime: 60 * 1000
		}
	);

	const config = {
		type: 'pipeline-execution',
		columnProperties: {
			id: {
				type: ComponentType.NUMBER
			},
			executionStatus: {
				type: ComponentType.ENUM,
				values: enumValues(PipelineExecutionStatusEnum),
				enumColorKey: {
					[PipelineExecutionStatusEnum.WAITING]: 'blue',
					[PipelineExecutionStatusEnum.SUCCESS]: 'green',
					[PipelineExecutionStatusEnum.FAILED]: 'red',
					[PipelineExecutionStatusEnum.ABORTED]: 'gray'
				}
			} satisfies EnumComponentTypeProperties<PipelineExecutionStatusEnum>,
			blueprintName: {
				type: ComponentType.STRING
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
		forcedSearchQuery: {
			orderBy: {
				column: 'createdAt',
				order: 'desc'
			}
		},
		dataUniquePropertyKey: 'id',
		messageFormatter: format,
		searchParser: new AdvancedSearchParser(),
		onItemClick: (item: PipelineExecutionDatatableDto) => goto(`/pipelines/${item.id}`)
	} satisfies DataTableConfig<PipelineExecutionDatatableDto>;
</script>

<MainLayout icon={LucideWorkflow} title="Pipelines">
	{#snippet toolbar()}
		<ToolbarButton icon={LucidePlus} tooltip="Blueprint erstellen" class="btn-success" />
	{/snippet}
	<Card class="bg-base-100 border-base-300 rounded-box border shadow">
		<CardBody class="overflow-hidden p-4 pb-8">
			<DataTable {config} {dataSource} striped hoverable />
		</CardBody>
	</Card>
</MainLayout>

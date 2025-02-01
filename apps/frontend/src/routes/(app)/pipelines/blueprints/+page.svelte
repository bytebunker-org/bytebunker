<script lang="ts">
	import {
		Card,
		CardBody,
		Breadcrumb,
		BreadcrumbItem,
		Button
	} from '@bytebunker/daisyui-components';
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
	import { writable } from 'svelte/store';
	import { format } from 'svelte-i18n';

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

<svelte:head>
	<title>Blueprints</title>
</svelte:head>

<Breadcrumb class="pt-0 pb-2">
	<BreadcrumbItem href="/">Pipelines</BreadcrumbItem>
	<BreadcrumbItem>Blueprints</BreadcrumbItem>
</Breadcrumb>

<div class="mb-8 flex items-center justify-between">
	<h1 class="font-stratos mb-1 text-3xl font-bold uppercase">Pipeline Blueprints</h1>
	<Button color="primary" href="/pipelines/blueprints">Blueprint erstellen</Button>
</div>

<div role="tablist" class="tabs tabs-lift translate-y-[1px]">
	<a role="tab" class="tab" href="/pipelines">Pipelines</a>
	<a role="tab" class="tab tab-active" href="/pipelines/blueprints">Blueprints</a>
</div>

<Card class="bg-base-100 border-base-300 rounded-tl-none border shadow-sm ">
	<CardBody class="overflow-hidden">
		<DataTable {config} {dataSource} striped hoverable />
	</CardBody>
</Card>

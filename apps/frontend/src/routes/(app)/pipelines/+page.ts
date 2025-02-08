import { buildDataTableQueryOptions, prefetchQueries } from '$lib/util/prefetchUtil.js';
import type { RouteParams, PageServerData } from './$types';
import type { PipelineExecutionDatatableDto } from '@bytebunker/backend';
import { PipelineApi } from '$lib/api/PipelineApi.js';

export const load = prefetchQueries<RouteParams, PageServerData>(({ fetch }) => [
	buildDataTableQueryOptions<PipelineExecutionDatatableDto>({
		dataTableType: 'pipeline-execution',
		apiFunction: (data) => PipelineApi.findAllDatatable(data, fetch)
	})
]);

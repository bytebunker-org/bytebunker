import { buildDataTableQueryOptions, prefetchQueries } from '$lib/util/prefetchUtil.js';
import type { RouteParams, PageServerData } from './$types';
import { PipelineBlueprintApi } from '$lib/api/PipelineBlueprintApi.js';
import type { PipelineBlueprintDatatableDto } from '@bytebunker/backend';

export const load = prefetchQueries<RouteParams, PageServerData>(({ fetch }) => [
	buildDataTableQueryOptions<PipelineBlueprintDatatableDto>({
		dataTableType: 'pipeline-blueprint',
		apiFunction: (data) => PipelineBlueprintApi.findAllDatatable(data, fetch)
	})
]);

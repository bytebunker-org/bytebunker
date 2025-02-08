import { prefetchQueries } from '$lib/util/prefetchUtil.js';
import type { RouteParams, PageServerData } from './$types';
import { PipelineBlueprintApi } from '$lib/api/PipelineBlueprintApi.js';
import type { FindOneDto, PipelineBlueprintDto } from '@bytebunker/backend';

export const load = prefetchQueries<RouteParams, PageServerData>(({ params, fetch }) => [
	{
		queryKey: [
			'pipeline-blueprint',
			Number(params.id),
			{} satisfies FindOneDto<PipelineBlueprintDto>
		],
		queryFn: ({ queryKey }) => PipelineBlueprintApi.findOne(queryKey[1], queryKey[2], fetch),
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000
	}
]);

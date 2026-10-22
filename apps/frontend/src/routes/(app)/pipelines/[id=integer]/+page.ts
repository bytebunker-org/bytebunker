import { prefetchQueries } from '$lib/util/prefetchUtil.js';
import type { RouteParams, PageServerData } from './$types';
import type { FindOneDto, PipelineExecutionDto } from '@bytebunker/backend';
import { PipelineApi } from '$lib/api/PipelineApi.js';

export const load = prefetchQueries<RouteParams, PageServerData>(({ params, fetch }) => [
	{
		queryKey: [
			'pipeline',
			Number(params.id),
			{
				populate: ['blueprint', 'executionData'],
				// Node outputs can be tens of megabytes; they are loaded lazily per node
				exclude: ['executionData.data']
			} satisfies FindOneDto<
				PipelineExecutionDto,
				'blueprint' | 'executionData',
				'*',
				'executionData.data'
			>
		],
		queryFn: ({ queryKey }) => PipelineApi.findOne(queryKey[1], queryKey[2], fetch),
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000
	}
]);

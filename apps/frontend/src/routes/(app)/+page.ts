import { prefetchQueries } from '$lib/util/prefetchUtil.js';
import type { RouteParams, PageServerData } from './$types';
import { DateTime } from 'luxon';
import { ActivityGraphSearchApi } from '$lib/api/ActivityGraphSearchApi.js';

export const load = prefetchQueries<RouteParams, PageServerData>(
	({ fetch }) => [],
	({ fetch, url }) => {
		const parsedStartDate = DateTime.fromISO(url.searchParams.get('start') ?? '').endOf('day');
		const cursorStart = parsedStartDate ?? DateTime.now().endOf('day');

		return [
			{
				queryKey: ['activitySearch', {}],
				queryFn: ({ pageParam, queryKey }) =>
					ActivityGraphSearchApi.search(
						{
							...queryKey[1],
							cursorStart: pageParam[1].toISO() as unknown as DateTime
						},
						fetch
					),
				initialPageParam: ['cursorStart', cursorStart],
				staleTime: 2 * 60 * 1000,
				gcTime: 5 * 60 * 1000
			}
		];
	}
);

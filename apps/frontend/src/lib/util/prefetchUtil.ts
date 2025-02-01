import type { Load, LoadEvent } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import type { FetchQueryOptions, QueryClient } from '@tanstack/svelte-query';
import type {
	ApiFunction,
	PaginatedListRequest,
	PaginatedListResponse
} from 'svelte-advanced-datatable';
import { hasOwnProperty } from '$lib/util/util.js';

export function prefetchQueries<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>,
	InputData extends Record<string, unknown> | null = Record<string, any> | null,
	ParentData extends Record<string, unknown> & { queryClient: QueryClient } = Record<
		string,
		any
	> & {
		queryClient: QueryClient;
	}
>(
	queryOptions: (
		loadEvent: LoadEvent<Params, InputData, ParentData>
	) =>
		| FetchQueryOptions<any, unknown, any, any>[]
		| Promise<FetchQueryOptions<any, unknown, any, any>[]>
): Load<Params, InputData, ParentData> {
	return async (event) => {
		const { parent } = event;
		const parentData = await parent();
		const { queryClient } = parentData;

		const queryOptionsList = await queryOptions({
			...event,
			parent: () => Promise.resolve(parentData)
		});

		await Promise.allSettled(
			queryOptionsList
				.filter(
					(options) =>
						!hasOwnProperty(options, 'enabled') ||
						typeof options.enabled !== 'boolean' ||
						options.enabled
				)
				.map((options) => queryClient.prefetchQuery(options))
		);

		for (const query of queryOptionsList) {
			if (query.queryKey) {
				const state = queryClient.getQueryState<
					unknown,
					{
						error: string;
						statusCode: number;
					}
				>(query.queryKey);

				if (state && state.status === 'error' && Number(state.error?.statusCode) === 403) {
					redirect(307, '/auth/login');
				}
			}
		}

		return event.data;
	};
}

export function buildDataTableQueryOptions<Data = unknown>({
	dataTableType,
	apiFunction,
	queryOptions,
	initialRequestData
}: {
	dataTableType: string;
	apiFunction: ApiFunction<Data>;
	queryOptions?: FetchQueryOptions<
		PaginatedListResponse<Data>,
		unknown,
		PaginatedListResponse<Data>,
		[string, PaginatedListRequest<Data>]
	>;
	initialRequestData?: Partial<PaginatedListRequest<Data>>;
}): FetchQueryOptions<
	PaginatedListResponse<Data>,
	unknown,
	PaginatedListResponse<Data>,
	[string, PaginatedListRequest<Data>]
> {
	initialRequestData ??= {};

	return {
		queryFn: ({ queryKey }) => apiFunction(queryKey[1]),
		queryKey: [`dataTable-${dataTableType}`, normalizeDataTableRequestData(initialRequestData)],
		gcTime: 60 * 1000,
		staleTime: 60 * 1000,
		...queryOptions
	};
}

function normalizeDataTableRequestData<Data>(
	data: Partial<PaginatedListRequest<Data>>
): PaginatedListRequest<Data> {
	return {
		start: data.start ?? 0,
		amount: data.amount ?? 50,
		orderBy:
			data.orderBy && data.orderBy.column
				? {
						order: data.orderBy.order ?? 'desc',
						column: data.orderBy.column
					}
				: undefined,
		rawSearchQuery: data.rawSearchQuery ?? '',
		searchQuery: {
			searchText: data.searchQuery?.searchText ?? '',
			searchCategories: data.searchQuery?.searchCategories ?? [],
			searchFilters: data.searchQuery?.searchFilters ?? [],
			forceGlobalSearch: data.searchQuery?.forceGlobalSearch ?? false
		}
	};
}

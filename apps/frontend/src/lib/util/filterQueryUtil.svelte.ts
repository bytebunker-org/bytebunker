import { goto } from '$app/navigation';
import { page } from '$app/state';
import { DateTime } from 'luxon';
import { browser, building } from '$app/environment';
import type { SearchFilter } from 'svelte-advanced-datatable';
import type { ForcedSearchQuery } from 'svelte-advanced-datatable/searchParser';

interface FilterTypeMap {
	boolean: boolean;
	number: number;
	string: string;
	'number-array': number[];
	'string-array': string[];
	date: DateTime;
	'date-time': DateTime;
}

type FilterType = keyof FilterTypeMap;

interface FilterTypeDefaultTypeMap {
	boolean: boolean;
	number: number | undefined;
	string: string | undefined;
	'number-array': number[];
	'string-array': string[];
	date: DateTime | undefined;
	'date-time': DateTime | undefined;
}

interface FilterDefinition<T extends FilterType> {
	type: T;
	default?: FilterTypeMap[T];
	disableSortingArray?: boolean;
}

export interface FilterDefinitions {
	[Key: string]: FilterDefinition<FilterType>;
}

type DefinitionObjectEntries<Defs extends FilterDefinitions> = [
	keyof Defs & string,
	FilterDefinition<FilterType>
][];

export type ParsedFilters<Defs extends FilterDefinitions> = {
	[K in keyof Defs & string]: Defs[K] extends { default: any }
		? FilterTypeMap[Defs[K]['type']]
		: FilterTypeDefaultTypeMap[Defs[K]['type']];
};

const filterTypeDefaults: Record<FilterType, unknown> = {
	boolean: false,
	number: undefined,
	string: undefined,
	'number-array': [],
	'string-array': [],
	date: undefined,
	'date-time': undefined
};

function parseFilterValue(def: FilterDefinition<FilterType>, paramValue: string): unknown {
	switch (def.type) {
		case 'boolean':
			return paramValue === 'true';
		case 'number':
			return Number(paramValue);
		case 'string':
			return paramValue;
		case 'number-array':
			if (def.disableSortingArray) {
				return paramValue.split(',').map(Number);
			} else {
				return paramValue.split(',').map(Number).sort();
			}
		case 'string-array':
			if (def.disableSortingArray) {
				return paramValue.split(',');
			} else {
				return paramValue.split(',').sort((a, b) => String(a).localeCompare(String(b)));
			}
		case 'date':
			return paramValue ? DateTime.fromISO(paramValue).startOf('day') : undefined;
		case 'date-time':
			return paramValue ? DateTime.fromISO(paramValue) : undefined;
		default:
			throw new TypeError(`Unknown filter definition type: ${def.type}`);
	}
}

function stringifyFilterValue(def: FilterDefinition<FilterType>, value: unknown): string {
	switch (def.type) {
		case 'boolean':
		case 'number':
		case 'string':
			return String(value);
		case 'number-array':
			if (def.disableSortingArray) {
				return (value as number[]).join(',');
			} else {
				return [...(value as number[])].sort().join(',');
			}
		case 'string-array':
			if (def.disableSortingArray) {
				return (value as any[]).join(',');
			} else {
				return [...(value as any[])].sort((a, b) => String(a).localeCompare(b)).join(',');
			}
		case 'date':
			return value && DateTime.isDateTime(value) ? (value.toISODate() ?? '') : '';
		case 'date-time':
			return value && DateTime.isDateTime(value)
				? (value.toISO({
						suppressMilliseconds: true,
						suppressSeconds: true
					}) ?? '')
				: '';
		default:
			throw new TypeError(`Unknown filter definition type: ${def.type}`);
	}
}

function compareFilterValues(def: FilterDefinition<FilterType>, a: unknown, b: unknown): boolean {
	switch (def.type) {
		case 'number-array':
		case 'string-array':
			return a && b && Array.isArray(a) && Array.isArray(b)
				? a.length === b.length && a.every((v, i) => v === b[i])
				: false;
		case 'date':
			return a && b && DateTime.isDateTime(a) && DateTime.isDateTime(b)
				? a.startOf('day').equals(b.startOf('day'))
				: false;
		case 'date-time':
			return a && b && DateTime.isDateTime(a) && DateTime.isDateTime(b) ? a.equals(b) : false;
		default:
			return a === b;
	}
}

export class FilterQueryUtil<Defs extends FilterDefinitions> {
	public readonly filters = $derived(this.parseFilters());
	public buildFilterUrl: (
		newFilters: Partial<{ [K in keyof Defs]: FilterTypeMap[Defs[K]['type']] | null }>
	) => string = $derived(this._buildFilterUrlFunction());
	public createForcedSearchQuery: <DatatableData>() => ForcedSearchQuery<DatatableData> = $derived(
		() => this._createForcedSearchQuery(this.filters)
	);

	constructor(public readonly definitions: Defs) {}

	public _createForcedSearchQuery<Defs extends FilterDefinitions, DatatableData>(
		parsedFilters: ParsedFilters<Defs>
	): ForcedSearchQuery<DatatableData> {
		const filters: SearchFilter[] = (
			Object.entries(this.definitions) as DefinitionObjectEntries<Defs>
		).map(
			([key, def]) =>
				({
					type: key as string,
					value: stringifyFilterValue(def, parsedFilters[key])
				}) satisfies SearchFilter
		);

		return {
			searchQuery: {
				searchFilters: filters
			}
		} as ForcedSearchQuery<DatatableData>;
	}

	public async applyFilter(
		newFilters: Partial<{ [K in keyof Defs]: FilterTypeMap[Defs[K]['type']] | null }>,
		opts?: Parameters<typeof goto>[1]
	): Promise<void> {
		const url = this.buildFilterUrl(newFilters);

		if (browser) {
			await goto(url, {
				replaceState: true,
				keepFocus: true,
				noScroll: true,
				...opts
			});
		}
	}

	private parseFilters(): ParsedFilters<Defs> {
		const searchParams = !building ? page.url.searchParams : new URLSearchParams();

		const filters = {} as ParsedFilters<Defs>;

		for (const [key, def] of Object.entries(this.definitions) as DefinitionObjectEntries<Defs>) {
			const paramValue = searchParams.get(key as string);

			let value: any;
			if (paramValue === null || paramValue === '') {
				value = this.normalizeValue(def, def.default) ?? filterTypeDefaults[def.type];
			} else {
				value = parseFilterValue(def, paramValue);
			}

			filters[key] = value;
		}

		return filters;
	}

	private _buildFilterUrlFunction() {
		const currentParams = !building ? page.url.searchParams : new URLSearchParams();

		return (
			newFilters: Partial<{ [K in keyof Defs]: FilterTypeMap[Defs[K]['type']] | null }>
		): string => {
			const params = new URLSearchParams();

			for (const [key, def] of Object.entries(this.definitions) as DefinitionObjectEntries<Defs>) {
				if (currentParams.has(key)) {
					params.set(key, currentParams.get(key)!);
				}

				const newValue = newFilters[key];

				if (newValue === undefined) {
					// Do nothing, keep existing
					continue;
				}

				if (newValue === null) {
					// Remove the filter from the params
					params.delete(key);
					continue;
				}

				const newValueNormalized = this.normalizeValue(def, newValue);

				// If value equals default, remove it to keep query params clean
				const defaultValue = this.normalizeValue(def, def.default) ?? filterTypeDefaults[def.type];

				const isDefault = compareFilterValues(def, defaultValue, newValueNormalized);

				if (isDefault) {
					params.delete(key);
					continue;
				}

				params.set(key, stringifyFilterValue(def, newValueNormalized));
			}

			const paramsString = params.toString();
			return page.url.pathname + (paramsString ? '?' + params.toString() : '');
		};
	}

	private normalizeValue<T>(def: FilterDefinition<FilterType>, value: T | undefined) {
		return value ? parseFilterValue(def, stringifyFilterValue(def, value)) : undefined;
	}
}

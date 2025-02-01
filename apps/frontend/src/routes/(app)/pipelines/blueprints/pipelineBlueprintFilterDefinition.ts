import type { FilterDefinitions, FilterQueryUtil } from '$lib/util/filterQueryUtil.svelte.js';

export const pipelineBlueprintFilterDefinition = {} satisfies FilterDefinitions;

export type PipelineBlueprintFilterQueryUtil = FilterQueryUtil<
	typeof pipelineBlueprintFilterDefinition
>;

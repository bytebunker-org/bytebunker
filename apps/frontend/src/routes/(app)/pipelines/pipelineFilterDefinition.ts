import type { FilterDefinitions, FilterQueryUtil } from '$lib/util/filterQueryUtil.svelte.js';

export const pipelineFilterDefinition = {} satisfies FilterDefinitions;

export type PipelineFilterQueryUtil = FilterQueryUtil<typeof pipelineFilterDefinition>;

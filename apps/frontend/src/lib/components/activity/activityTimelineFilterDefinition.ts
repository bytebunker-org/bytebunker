import type { FilterDefinitions, FilterQueryUtil } from '$lib/util/filterQueryUtil.svelte.js';
import { DateTime } from 'luxon';

export const activityTimelineFilterDefinition = {
	start: {
		type: 'date',
		default: DateTime.now().toISODate()
	},
	end: {
		type: 'date'
	}
} satisfies FilterDefinitions;

export type ActivityTimelineFilterQueryUtil = FilterQueryUtil<
	typeof activityTimelineFilterDefinition
>;

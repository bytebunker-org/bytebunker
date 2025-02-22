import type { ASActivity } from '@bytebunker/event-schema';

export type ActivityCardSize = 'sm' | 'md' | 'lg';

export interface ActivityPropsInterface<T extends ASActivity> {
	activity: T;

	initialCardSize: Pick<ActivityCardSize, 'sm' | 'md'>;

	isFirstInGroup: boolean;

	isLastInGroup: boolean;
}

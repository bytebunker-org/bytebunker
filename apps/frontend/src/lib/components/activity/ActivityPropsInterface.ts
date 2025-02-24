import type { ASActivity } from '@bytebunker/event-schema';

export type ActivityCardSize = 'merged' | 'sm' | 'md' | 'lg';

export interface ActivityPropsInterface<T extends ASActivity> {
	activity: T;

	mergedActivities?: ASActivity[];

	nestedActivities: ASActivity[];

	cardSize: ActivityCardSize;

	index: number;

	isFirstInGroup: boolean;

	isLastInGroup: boolean;

	hideIcon?: boolean;
}

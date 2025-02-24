import type { ActivityDto } from '@bytebunker/backend';
import { Interval } from 'luxon';
import { getActivityTypeData } from '$lib/components/activity/activityTypeRegistry.js';
import type { ActivityType, ASActivity } from '@bytebunker/event-schema';

type Activity = ActivityDto &
	Omit<ASActivity, 'startTime'> &
	Required<Pick<ASActivity, 'startTime'>>;

export type SingleActivityTimelineEntry<T extends ASActivity> = {
	type: 'activity';
	activity: T;
	nestedActivities: Activity[];
};

export type ActivityCollectionTimelineEntry = {
	type: 'collection';
	activities: Activity[];
};

export type ActivityTimelineEntry = SingleActivityTimelineEntry | ActivityCollectionTimelineEntry;

export function processActivityTimelineDay(activities: ASActivity[]): ActivityTimelineEntry[] {
	const results: ActivityTimelineEntry[] = [];

	for (let i = 0; i < activities.length; i++) {
		const current = activities[i] as Activity;
		const { allowNestedActivities, allowMerging } = getActivityTypeData(current['@type']);

		// Prepare an 'activity' entry that might get nested children or merged
		const entry: ActivityTimelineEntry = {
			type: 'activity',
			activity: current,
			nestedActivities: []
		};

		let nestedAtLeastOne = false;

		if (allowNestedActivities && current.endTime) {
			const parentInterval = Interval.fromDateTimes(current.startTime, current.endTime);

			// Keep looking ahead to see if we can nest subsequent activities
			while (true) {
				const nextIndex = i + 1;
				if (nextIndex >= activities.length) break;

				const candidate = activities[nextIndex] as Activity;
				const { allowNesting } = getActivityTypeData(candidate['@type']);

				if (!candidate.endTime || !allowNesting) {
					break;
				}

				const candidateInterval = Interval.fromDateTimes(candidate.startTime, candidate.endTime);

				const isContained = parentInterval.engulfs(candidateInterval);
				const isDifferentType = candidate['@type'] !== current['@type'];

				if (!isContained || !isDifferentType) {
					break;
				}

				entry.nestedActivities.push(candidate);
				nestedAtLeastOne = true;
				i++; // skip over the nested activity in the top-level loop
			}
		}

		if (nestedAtLeastOne) {
			results.push(entry);

			continue;
		}

		// Nothing nested, try merging if it's allowed for this activity
		if (allowMerging) {
			// Collect all following items of the same type
			const collection: Activity[] = [current];

			while (true) {
				const nextIndex = i + 1;

				if (nextIndex >= activities.length) {
					break;
				}

				const nextActivity = activities[nextIndex] as Activity;
				const { allowMerging: allowMergingNext } = getActivityTypeData(
					nextActivity['@type'] as ActivityType
				);

				const isDifferentType = nextActivity['@type'] !== current['@type'];

				if (isDifferentType || !allowMergingNext) {
					break;
				}

				collection.push(nextActivity);
				i++; // skip these from top-level
			}

			// It's only a collection if we collected more than one
			if (collection.length > 1) {
				results.push({
					type: 'collection',
					activities: collection
				});
			} else {
				results.push({
					type: 'activity',
					activity: current,
					nestedActivities: []
				});
			}
		} else {
			// Not mergeable or anything else, just an activity
			results.push({
				type: 'activity',
				activity: current,
				nestedActivities: []
			});
		}
	}

	return results;
}

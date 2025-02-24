import type { ASActivity } from '@bytebunker/event-schema';
import { calculateDistance, hasOwn } from '$lib/util/util.js';
import type { GoogleTimelineActivityInterface } from '@bytebunker/backend';
import humanizeDuration from 'humanize-duration';

/**
 * @return the distance in kilometers
 */
export function calculateActivityDistance(
	activity: ASActivity & GoogleTimelineActivityInterface
): number | undefined {
	if (
		activity.origin?.['@type'] !== 'Place' ||
		activity.target?.['@type'] !== 'Place' ||
		!hasOwn(activity.origin, 'latitude') ||
		typeof activity.origin.latitude !== 'number' ||
		!hasOwn(activity.origin, 'longitude') ||
		typeof activity.origin.longitude !== 'number' ||
		!hasOwn(activity.target, 'latitude') ||
		typeof activity.target.latitude !== 'number' ||
		!hasOwn(activity.target, 'longitude') ||
		typeof activity.target.longitude !== 'number'
	) {
		return;
	}

	const calculatedDistance = calculateDistance(
		activity.origin.latitude,
		activity.origin.longitude,
		activity.target.latitude,
		activity.target.longitude
	);
	return activity.waypointPath?.distanceMeters
		? activity.waypointPath?.distanceMeters / 1000
		: calculatedDistance;
}

export const shortEnglishDuration = humanizeDuration.humanizer({
	language: 'shortEn',
	languages: {
		shortEn: {
			y: () => 'y',
			mo: () => 'mo',
			w: () => 'w',
			d: () => 'd',
			h: () => 'h',
			m: () => 'm',
			s: () => 's',
			ms: () => 'ms'
		}
	},
	round: true,
	largest: 2
});

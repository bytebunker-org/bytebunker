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

export function buildSpotifyOpenUrl(spotifyIdentifier: string): string | undefined {
	let type = 'track';
	let id = spotifyIdentifier;

	const uriMatch = spotifyIdentifier ? /spotify:(\w+):(.+)/.exec(spotifyIdentifier) : undefined;

	if (uriMatch) {
		type = uriMatch[1];
		id = uriMatch[2];
	}

	return id ? `https://open.spotify.com/${type}/${id}` : undefined;
}

export function buildGoogleMapsPlaceUrl(
	location: { lat: number | undefined; lng: number | undefined },
	placeId: string | undefined
) {
	if (!location.lat || !location.lng) {
		return;
	}

	const params = new URLSearchParams();
	params.set('api', '1');
	params.set('query', `${location.lat},${location.lng}`);
	if (placeId) {
		params.set('query_place_id', placeId);
	}

	return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function buildGoogleMapsDirectionsUrl(
	origin: { lat: number | undefined; lng: number | undefined },
	originPlaceId: string | undefined,
	target: { lat: number | undefined; lng: number | undefined },
	targetPlaceId: string | undefined
): string | undefined {
	if (!origin.lat || !origin.lng || !target.lat || !target.lng) {
		return;
	}

	const params = new URLSearchParams();
	params.set('api', '1');
	params.set('origin', `${origin.lat},${origin.lng}`);
	if (originPlaceId) {
		params.set('origin_place_id', originPlaceId);
	}
	params.set('destination', `${target.lat},${target.lng}`);
	if (targetPlaceId) {
		params.set('destination_place_id', targetPlaceId);
	}

	return `https://www.google.com/maps/dir/?${params.toString()}`;
}

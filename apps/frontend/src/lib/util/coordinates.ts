export interface ParsedCoordinates {
	lat: number;
	lng: number;
	/** What the input was recognised as. */
	format: 'pair' | 'google-maps' | 'geo-uri';
}

const NUMBER = '[-+]?\\d{1,3}(?:\\.\\d+)?';
const PAIR = new RegExp(`^\\s*(${NUMBER})\\s*[,;\\s]\\s*(${NUMBER})\\s*$`);
/** `…/@53.55,9.99,17z` in Google Maps place and map URLs. */
const GOOGLE_AT = new RegExp(`@(${NUMBER}),(${NUMBER})`);
/** `!3d53.55!4d9.99` in Google Maps place URLs: the place itself, more exact than the map centre after `@`. */
const GOOGLE_DATA = new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`);
const GEO_URI = new RegExp(`^\\s*geo:(${NUMBER}),(${NUMBER})`, 'i');

function toCoordinates(
	lat: string | undefined,
	lng: string | undefined,
	format: ParsedCoordinates['format']
): ParsedCoordinates | undefined {
	const latitude = Number(lat);
	const longitude = Number(lng);

	if (
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude) ||
		Math.abs(latitude) > 90 ||
		Math.abs(longitude) > 180
	) {
		return undefined;
	}

	return { lat: latitude, lng: longitude, format };
}

/**
 * Reads coordinates from "lat, lng", a Google Maps URL (`@lat,lng`, `!3dlat!4dlng`, `?q=lat,lng`, `?ll=`,
 * `?query=`) or a geo: URI (`geo:lat,lng?q=…`). Undefined if nothing usable is found.
 */
export function parseCoordinates(input: string): ParsedCoordinates | undefined {
	const text = input.trim();

	if (!text) {
		return undefined;
	}

	const pair = PAIR.exec(text);

	if (pair) {
		return toCoordinates(pair[1], pair[2], 'pair');
	}

	const geo = GEO_URI.exec(text);

	if (geo) {
		const coordinates = toCoordinates(geo[1], geo[2], 'geo-uri');

		// `geo:0,0?q=lat,lng(label)` (Android) puts the place into q
		if (coordinates && coordinates.lat === 0 && coordinates.lng === 0) {
			const query = /[?&]q=([^&(]+)/.exec(text)?.[1];
			const inner = query ? PAIR.exec(decodeURIComponent(query)) : null;

			return inner ? toCoordinates(inner[1], inner[2], 'geo-uri') : coordinates;
		}

		return coordinates;
	}

	if (/^https?:\/\//i.test(text) || /google\./i.test(text) || /maps\.app\.goo\.gl/i.test(text)) {
		const data = GOOGLE_DATA.exec(text);

		if (data) {
			return toCoordinates(data[1], data[2], 'google-maps');
		}

		try {
			const url = new URL(text);

			for (const key of ['q', 'query', 'll', 'center', 'destination']) {
				const value = url.searchParams.get(key);
				const inner = value ? PAIR.exec(value) : null;

				if (inner) {
					return toCoordinates(inner[1], inner[2], 'google-maps');
				}
			}
		} catch {
			/* not a URL after all */
		}

		const at = GOOGLE_AT.exec(text);

		if (at) {
			return toCoordinates(at[1], at[2], 'google-maps');
		}
	}

	return undefined;
}

export function formatCoordinates(lat: number, lng: number, digits = 6): string {
	return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
}

const EARTH_RADIUS_METERS = 6_371_008.8;

/** Points of a circle of `radiusMeters` around the centre (closed: the last point equals the first). */
export function circlePolygon(
	center: { lat: number; lng: number },
	radiusMeters: number,
	steps = 32
): { lat: number; lng: number }[] {
	const angular = radiusMeters / EARTH_RADIUS_METERS;
	const lat1 = (center.lat * Math.PI) / 180;
	const lng1 = (center.lng * Math.PI) / 180;
	const points: { lat: number; lng: number }[] = [];

	for (let index = 0; index <= steps; index++) {
		const bearing = ((index % steps) / steps) * 2 * Math.PI;
		const lat2 = Math.asin(
			Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
		);
		const lng2 =
			lng1 +
			Math.atan2(
				Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
				Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
			);

		points.push({ lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI });
	}

	return points;
}

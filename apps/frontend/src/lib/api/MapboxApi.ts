import { PUBLIC_MAPBOX_TOKEN } from '$env/static/public';
import polyline from '@mapbox/polyline';
import { circlePolygon } from '$lib/util/coordinates.js';

/* const styles: Record<MapboxStyle, string> = {
	dawn: PUBLIC_MAPBOX_STYLE_ID_DAWN,
	day: PUBLIC_MAPBOX_STYLE_ID_DAY,
	dusk: PUBLIC_MAPBOX_STYLE_ID_DUSK,
	night: PUBLIC_MAPBOX_STYLE_ID_NIGHT
};*/

export type MapboxStyle = 'dawn' | 'day' | 'dusk' | 'night';

export class MapboxApi {
	public static buildMapboxStaticImageUrl({
		waypoints,
		width,
		height
	}: {
		waypoints: { lat: number; lng: number }[];
		style: MapboxStyle;
		width: number;
		height: number;
	}): string {
		const coords = waypoints.map((w) => [w.lat, w.lng] as [number, number]);
		const pathPolyline = `path-4+ef7c00-0.7(${polyline.encode(coords)})`;
		// {name}-{label}+{color}({lon},{lat})

		const startMarker = `pin-l+ef7c00(${waypoints[0].lng},${waypoints[0].lat})`;
		const endMarker =
			waypoints.length > 1
				? `pin-l-embassy+ef7c00(${waypoints.at(-1)!.lng},${waypoints.at(-1)!.lat})`
				: undefined;
		const overlay = [startMarker, endMarker, pathPolyline].filter(Boolean).join(',');

		return `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${overlay}/auto/${width}x${height}?access_token=${PUBLIC_MAPBOX_TOKEN}&padding=40`;
	}

	/**
	 * Static map of a point with a filled circle of `radiusMeters` around it (a 32-gon drawn as path overlay).
	 * The map is fitted to the circle with some padding.
	 */
	public static buildCircleImageUrl({
		lat,
		lng,
		radiusMeters,
		width,
		height
	}: {
		lat: number;
		lng: number;
		radiusMeters: number;
		width: number;
		height: number;
	}): string {
		const ring = circlePolygon({ lat, lng }, radiusMeters).map(
			(point) => [Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6))] as [number, number]
		);
		const circle = `path-2+245150-0.9+245150-0.2(${encodeURIComponent(polyline.encode(ring))})`;
		const marker = `pin-s+ef7c00(${lng.toFixed(6)},${lat.toFixed(6)})`;

		return `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${circle},${marker}/auto/${width}x${height}@2x?access_token=${PUBLIC_MAPBOX_TOKEN}&padding=30`;
	}
}

import {
	PUBLIC_MAPBOX_TOKEN,
	PUBLIC_MAPBOX_USERNAME,
	PUBLIC_MAPBOX_STYLE_ID_DAWN,
	PUBLIC_MAPBOX_STYLE_ID_DAY,
	PUBLIC_MAPBOX_STYLE_ID_DUSK,
	PUBLIC_MAPBOX_STYLE_ID_NIGHT
} from '$env/static/public';
import polyline from '@mapbox/polyline';

const styles: Record<MapboxStyle, string> = {
	dawn: PUBLIC_MAPBOX_STYLE_ID_DAWN,
	day: PUBLIC_MAPBOX_STYLE_ID_DAY,
	dusk: PUBLIC_MAPBOX_STYLE_ID_DUSK,
	night: PUBLIC_MAPBOX_STYLE_ID_NIGHT
};

export type MapboxStyle = 'dawn' | 'day' | 'dusk' | 'night';

export class MapboxApi {
	public static buildMapboxStaticImageUrl({
		waypoints,
		style,
		width,
		height
	}: {
		waypoints: { lat: number; lng: number }[];
		style: MapboxStyle;
		width: number;
		height: number;
	}): string {
		const styleId = styles[style];

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
}

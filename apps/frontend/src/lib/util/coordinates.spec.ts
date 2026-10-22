import { describe, expect, it } from 'vitest';
import { circlePolygon, parseCoordinates } from './coordinates.js';

describe('parseCoordinates', () => {
	it('reads plain pairs', () => {
		expect(parseCoordinates('53.5511, 9.9937')).toEqual({
			lat: 53.5511,
			lng: 9.9937,
			format: 'pair'
		});
		expect(parseCoordinates(' -33.86 151.21 ')).toEqual({
			lat: -33.86,
			lng: 151.21,
			format: 'pair'
		});
		expect(parseCoordinates('53.5;9.9')).toEqual({ lat: 53.5, lng: 9.9, format: 'pair' });
	});

	it('reads Google Maps URLs', () => {
		expect(
			parseCoordinates('https://www.google.com/maps/@53.5511,9.9937,17z?entry=ttu')
		).toMatchObject({ lat: 53.5511, lng: 9.9937, format: 'google-maps' });
		expect(
			parseCoordinates('https://www.google.com/maps/search/?api=1&query=48.1374,11.5755')
		).toMatchObject({ lat: 48.1374, lng: 11.5755 });
		expect(parseCoordinates('https://maps.google.com/?q=48.1374,11.5755')).toMatchObject({
			lat: 48.1374,
			lng: 11.5755
		});
		expect(
			parseCoordinates(
				'https://www.google.de/maps/place/Rathaus/@53.55,9.99,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d53.5503!4d9.9925'
			)
		).toMatchObject({ lat: 53.5503, lng: 9.9925 });
	});

	it('reads geo: URIs', () => {
		expect(parseCoordinates('geo:53.55,9.99')).toEqual({
			lat: 53.55,
			lng: 9.99,
			format: 'geo-uri'
		});
		expect(parseCoordinates('geo:53.55,9.99;u=35')).toMatchObject({ lat: 53.55, lng: 9.99 });
		expect(parseCoordinates('geo:0,0?q=53.55,9.99(Zuhause)')).toMatchObject({
			lat: 53.55,
			lng: 9.99
		});
	});

	it('rejects garbage and out-of-range values', () => {
		expect(parseCoordinates('')).toBeUndefined();
		expect(parseCoordinates('Hamburg')).toBeUndefined();
		expect(parseCoordinates('95, 10')).toBeUndefined();
		expect(parseCoordinates('https://example.org/nothing')).toBeUndefined();
	});
});

describe('circlePolygon', () => {
	it('returns a closed ring at the given distance', () => {
		const points = circlePolygon({ lat: 50, lng: 8 }, 100, 8);

		expect(points).toHaveLength(9);
		expect(points[0]).toEqual(points[8]);
		// north point: 100 m ≈ 0.0009° latitude
		expect(points[0]!.lat - 50).toBeCloseTo(0.000899, 5);
		expect(points[0]!.lng).toBeCloseTo(8, 9);
	});
});

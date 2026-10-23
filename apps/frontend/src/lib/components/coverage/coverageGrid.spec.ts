import { describe, expect, it } from 'vitest';
import {
	buildMonthBuckets,
	buildYearGrid,
	expandDays,
	formatGap,
	intensityLevel,
	cellFill,
	seriesColor,
	yearSpan
} from './coverageGrid.js';

describe('coverageGrid', () => {
	it('lays out a year Monday-first', () => {
		// 2020-01-01 was a Wednesday
		const { cells, months, weeks } = buildYearGrid(2020);
		expect(cells).toHaveLength(366);
		expect(cells[0]).toEqual({ day: '2020-01-01', x: 0, y: 2 });
		expect(cells[5]).toEqual({ day: '2020-01-06', x: 1, y: 0 });
		expect(cells[365]).toEqual({ day: '2020-12-31', x: 52, y: 3 });
		expect(weeks).toBe(53);
		expect(months).toHaveLength(12);
		expect(months[0]).toEqual({ x: 0, label: 'Jan' });
	});

	it('scales intensity logarithmically', () => {
		expect(intensityLevel(0, 100)).toBe(0);
		expect(intensityLevel(1, 1)).toBe(4);
		expect(intensityLevel(1, 10000)).toBe(1);
		expect(intensityLevel(10000, 10000)).toBe(4);
	});

	it('expands and formats gaps', () => {
		expect(expandDays('2020-02-28', '2020-03-01')).toEqual([
			'2020-02-28',
			'2020-02-29',
			'2020-03-01'
		]);
		expect(formatGap({ from: '2020-03-02', to: '2020-06-14', days: 105 })).toBe(
			'keine Daten 2020-03-02 – 2020-06-14, 105 Tage'
		);
	});
});

describe('buildMonthBuckets', () => {
	it('sums days and counts per month, keeping empty months', () => {
		const buckets = buildMonthBuckets(
			{ '2020-02-01': 3, '2020-02-29': 1, '2021-12-31': 2, '2019-05-05': 9 },
			[2020, 2021]
		);
		expect(buckets).toHaveLength(24);
		expect(buckets[1]).toEqual({ year: 2020, month: 1, days: 2, daysInMonth: 29, count: 4 });
		expect(buckets[0]).toMatchObject({ days: 0, count: 0, daysInMonth: 31 });
		expect(buckets[23]).toMatchObject({ year: 2021, month: 11, days: 1, count: 2 });
	});

	it('spans years and picks colours in fixed order', () => {
		expect(yearSpan('2018-03-01', '2020-01-01')).toEqual([2018, 2019, 2020]);
		expect(yearSpan(undefined, '2020-01-01')).toEqual([]);
		expect(seriesColor(0)).toBe('#2a78d6');
		expect(seriesColor(99)).toMatch(/^hsl\(/);
		expect(cellFill('#2a78d6', 0)).toBe('color-mix(in oklab, #2a78d6 38%, white)');
		expect(cellFill('#2a78d6', 1)).toBe('color-mix(in oklab, #2a78d6 100%, white)');
	});
});

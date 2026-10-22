import { describe, expect, it } from 'vitest';
import { buildYearGrid, expandDays, formatGap, intensityLevel } from './coverageGrid.js';

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

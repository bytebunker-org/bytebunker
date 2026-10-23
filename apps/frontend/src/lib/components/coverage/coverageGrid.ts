export interface GridCell {
	day: string;
	/** Week column, 0-based; weeks start on Monday. */
	x: number;
	/** Weekday row, 0 = Monday. */
	y: number;
}

export interface MonthLabel {
	x: number;
	label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

/** Every day of a year laid out GitHub-style: weeks as columns, Monday to Sunday as rows. */
export function buildYearGrid(year: number): {
	cells: GridCell[];
	months: MonthLabel[];
	weeks: number;
} {
	const start = Date.UTC(year, 0, 1);
	const offset = (new Date(start).getUTCDay() + 6) % 7;
	const dayCount = (Date.UTC(year + 1, 0, 1) - start) / DAY_MS;
	const cells: GridCell[] = [];
	const months: MonthLabel[] = [];

	for (let i = 0; i < dayCount; i++) {
		const date = new Date(start + i * DAY_MS);
		const x = Math.floor((i + offset) / 7);
		cells.push({
			day: `${year}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
			x,
			y: (i + offset) % 7
		});
		if (date.getUTCDate() === 1) {
			months.push({ x, label: MONTHS[date.getUTCMonth()] });
		}
	}

	return { cells, months, weeks: Math.floor((dayCount - 1 + offset) / 7) + 1 };
}

/** 0 for no data, otherwise 1-4 on a log scale (counts per day vary by orders of magnitude). */
export function intensityLevel(count: number, max: number): number {
	if (count <= 0 || max <= 0) {
		return 0;
	}
	return Math.min(4, Math.max(1, Math.ceil((Math.log1p(count) / Math.log1p(max)) * 4)));
}

export function expandDays(from: string, to: string): string[] {
	const days: string[] = [];
	for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
		days.push(new Date(t).toISOString().slice(0, 10));
	}
	return days;
}

export function formatGap(gap: { from: string; to: string; days: number }): string {
	return `keine Daten ${gap.from} – ${gap.to}, ${gap.days} Tage`;
}

/**
 * Categorical series colours in fixed order (the first eight are CVD-checked for adjacent pairs). Never grey: a grey
 * series reads as "no data". Past the list, hues are spread by the golden angle.
 */
export const SERIES_COLORS = [
	'#2a78d6',
	'#eb6834',
	'#1baf7a',
	'#eda100',
	'#e87ba4',
	'#008300',
	'#6250d6',
	'#e34948',
	'#0891b2',
	'#a16207',
	'#c026d3',
	'#65a30d',
	'#1e40af',
	'#db2777',
	'#0d9488',
	'#9333ea'
];
/** The combined "Alle" series. */
export const ALL_SERIES_COLOR = '#4338ca';

export function seriesColor(index: number): string {
	return SERIES_COLORS[index] ?? `hsl(${Math.round((index * 137.508) % 360)} 70% 42%)`;
}

/**
 * A data cell's fill: the series colour mixed with white, never below `MIN_MIX` so sparse cells keep their hue
 * (lowering opacity instead turns every colour grey on the light background).
 */
const MIN_MIX = 38;

export function cellFill(color: string, strength: number): string {
	const mix = Math.round(MIN_MIX + (100 - MIN_MIX) * Math.min(1, Math.max(0, strength)));
	return `color-mix(in oklab, ${color} ${mix}%, white)`;
}

export interface MonthBucket {
	year: number;
	/** 0-based month. */
	month: number;
	/** Days with at least one activity. */
	days: number;
	daysInMonth: number;
	count: number;
}

export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Per-month totals of a series for every month of `years` (ascending), months without data included. */
export function buildMonthBuckets(days: Record<string, number>, years: number[]): MonthBucket[] {
	const index = new Map<string, MonthBucket>();
	const buckets = years.flatMap((year) =>
		MONTHS.map((_, month) => {
			const bucket = { year, month, days: 0, daysInMonth: daysInMonth(year, month), count: 0 };
			index.set(`${year}-${pad(month + 1)}`, bucket);
			return bucket;
		})
	);

	for (const [day, count] of Object.entries(days)) {
		const bucket = index.get(day.slice(0, 7));
		if (bucket && count > 0) {
			bucket.days++;
			bucket.count += count;
		}
	}

	return buckets;
}

export function monthLabel(month: number): string {
	return MONTHS[month];
}

/** Years from the first to the last day with data, ascending; empty without data. */
export function yearSpan(firstDay?: string, lastDay?: string): number[] {
	if (!firstDay || !lastDay) {
		return [];
	}
	const first = Number(firstDay.slice(0, 4));
	const last = Number(lastDay.slice(0, 4));
	return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

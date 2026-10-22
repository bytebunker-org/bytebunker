import type { CoverageGapDto, CoverageSeriesDto } from './dto/coverage.dto.js';

export interface CoverageRow {
    key: string;
    day: string;
    count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayToIndex(day: string): number {
    return Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

function indexToDay(index: number): string {
    return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

export function nextDay(day: string): string {
    return indexToDay(dayToIndex(day) + 1);
}

/** Turns per-day rows into series sorted by total (largest first). Rows with a count of 0 are dropped. */
export function bucketRows(rows: CoverageRow[], labels: Record<string, string> = {}): CoverageSeriesDto[] {
    const byKey = new Map<string, CoverageSeriesDto>();

    for (const { key, day, count } of rows) {
        if (count <= 0) {
            continue;
        }
        let series = byKey.get(key);
        if (!series) {
            series = { key, label: labels[key] ?? key, total: 0, days: {} };
            byKey.set(key, series);
        }
        series.days[day] = (series.days[day] ?? 0) + count;
        series.total += count;
    }

    for (const series of byKey.values()) {
        const days = Object.keys(series.days).sort();
        series.firstDay = days[0];
        series.lastDay = days[days.length - 1];
    }

    return [...byKey.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

/** Runs of at least `minGapDays` consecutive days without data between a series' first and last day. */
export function computeGaps(series: CoverageSeriesDto, minGapDays: number): CoverageGapDto[] {
    const days = Object.keys(series.days).sort();
    const gaps: CoverageGapDto[] = [];

    for (let i = 1; i < days.length; i++) {
        const length = dayToIndex(days[i]) - dayToIndex(days[i - 1]) - 1;
        if (length >= minGapDays) {
            gaps.push({
                key: series.key,
                from: indexToDay(dayToIndex(days[i - 1]) + 1),
                to: indexToDay(dayToIndex(days[i]) - 1),
                days: length,
            });
        }
    }

    return gaps;
}

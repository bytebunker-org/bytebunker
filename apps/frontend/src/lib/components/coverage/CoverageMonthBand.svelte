<script lang="ts" module>
	import { monthLabel, type MonthBucket } from './coverageGrid.js';

	export type CoverageMetric = 'days' | 'count';

	export interface MonthBandRow {
		key: string;
		label: string;
		color: string;
		/** One bucket per month of `years`, in order (see buildMonthBuckets). */
		buckets: MonthBucket[];
	}
</script>

<script lang="ts">
	interface Props {
		rows: MonthBandRow[];
		/** Years shown as columns, ascending. */
		years: number[];
		metric: CoverageMetric;
		selectedYear?: number;
		onselect: (year: number) => void;
	}

	let { rows, years, metric, selectedYear, onselect }: Props = $props();

	const LABEL_WIDTH = 120;
	const ROW_HEIGHT = 20;
	const ROW_GAP = 6;
	const TOP = 20;
	const MIN_MONTH_WIDTH = 4;

	let width = $state(0);
	let monthWidth = $derived(
		Math.max(MIN_MONTH_WIDTH, (width - LABEL_WIDTH) / Math.max(1, years.length * 12))
	);
	let yearWidth = $derived(monthWidth * 12);
	let svgWidth = $derived(LABEL_WIDTH + yearWidth * years.length);
	let height = $derived(TOP + rows.length * (ROW_HEIGHT + ROW_GAP));

	/** 0…1 fill strength: share of days with data, or log-scaled count relative to the row's busiest month. */
	function strength(bucket: MonthBucket, rowMax: number): number {
		if (metric === 'days') {
			return bucket.days / bucket.daysInMonth;
		}
		return bucket.count > 0 && rowMax > 0 ? Math.log1p(bucket.count) / Math.log1p(rowMax) : 0;
	}

	function rowMax(row: MonthBandRow): number {
		return Math.max(0, ...row.buckets.map((bucket) => bucket.count));
	}

	function onkeydown(event: KeyboardEvent, year: number) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect(year);
		}
	}
</script>

<div class="w-full overflow-x-auto" bind:clientWidth={width}>
	{#if width > 0}
		<svg width={svgWidth} {height} role="group" aria-label="Datenabdeckung pro Monat">
			{#each years as year, i (year)}
				{@const x = LABEL_WIDTH + i * yearWidth}
				<!-- Year header doubles as the keyboard-accessible year selector. -->
				<g
					role="button"
					tabindex="0"
					aria-pressed={year === selectedYear}
					aria-label="Jahr {year} auswählen"
					class="cursor-pointer outline-none"
					onclick={() => onselect(year)}
					onkeydown={(event) => onkeydown(event, year)}
				>
					<rect {x} y="0" width={yearWidth} height={TOP - 4} fill="transparent" />
					<text
						x={x + yearWidth / 2}
						y="12"
						text-anchor="middle"
						class="text-[11px] {year === selectedYear
							? 'fill-base-content font-semibold'
							: 'fill-base-content/60'}"
					>
						{year}
					</text>
				</g>
				{#if i > 0}
					<line x1={x} x2={x} y1={TOP - 4} y2={height} class="stroke-base-content/10" />
				{/if}
			{/each}

			{#each rows as row, r (row.key)}
				{@const y = TOP + r * (ROW_HEIGHT + ROW_GAP)}
				{@const max = rowMax(row)}
				<text
					x={LABEL_WIDTH - 8}
					y={y + ROW_HEIGHT / 2 + 4}
					text-anchor="end"
					class="fill-base-content text-[11px]"
				>
					{row.label.length > 18 ? `${row.label.slice(0, 17)}…` : row.label}
					<title>{row.label}</title>
				</text>
				{#each row.buckets as bucket, b (b)}
					{@const value = strength(bucket, max)}
					<rect
						x={LABEL_WIDTH + b * monthWidth + 0.5}
						{y}
						width={Math.max(1, monthWidth - 1)}
						height={ROW_HEIGHT}
						rx="1.5"
						class="cursor-pointer {bucket.days > 0 ? '' : 'fill-base-content/10'}"
						fill={bucket.days > 0 ? row.color : undefined}
						opacity={bucket.days > 0 ? 0.18 + 0.82 * value : 1}
						role="presentation"
						onclick={() => onselect(bucket.year)}
					>
						<title>
							{row.label} · {monthLabel(bucket.month)}
							{bucket.year}: {bucket.days}/{bucket.daysInMonth} Tage · {bucket.count.toLocaleString(
								'de-DE'
							)} Aktivitäten
						</title>
					</rect>
				{/each}
			{/each}

			{#if selectedYear !== undefined && years.includes(selectedYear)}
				<rect
					x={LABEL_WIDTH + years.indexOf(selectedYear) * yearWidth - 1}
					y={TOP - 3}
					width={yearWidth + 1}
					height={height - TOP + 3}
					rx="4"
					fill="none"
					class="stroke-base-content pointer-events-none"
					stroke-width="1.5"
				/>
			{/if}
		</svg>
	{/if}
</div>

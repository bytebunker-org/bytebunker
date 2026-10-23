<script lang="ts">
	import { ALL_SERIES_COLOR, buildYearGrid, cellFill, intensityLevel } from './coverageGrid.js';

	interface Props {
		year: number;
		days: Record<string, number>;
		max: number;
		/** Days inside a gap of the series; drawn with a red outline. */
		gapDays: Set<string>;
		/** First/last day with data in the series; cells outside are drawn fainter. */
		firstDay?: string;
		lastDay?: string;
		/** Fill of cells with data; defaults to the combined series' colour. */
		color?: string;
	}

	let { year, days, max, gapDays, firstDay, lastDay, color }: Props = $props();

	const CELL = 11;
	const STEP = 13;
	const LEFT = 4;
	const TOP = 16;

	let grid = $derived(buildYearGrid(year));
	let width = $derived(LEFT + grid.weeks * STEP);
	/** Fill strength per intensity level; level 1 keeps enough colour to be seen. */
	const STRENGTH = [0, 0, 0.35, 0.7, 1];
</script>

<!-- One SVG per year with plain rects: ~370 nodes, cheap even for many series and years. -->
<svg {width} height={TOP + 7 * STEP} role="img" aria-label="Datenabdeckung {year}">
	{#each grid.months as month}
		<text x={LEFT + month.x * STEP} y="10" class="fill-base-content/60 text-[10px]">
			{month.label}
		</text>
	{/each}
	{#each grid.cells as cell (cell.day)}
		{@const count = days[cell.day] ?? 0}
		{@const level = intensityLevel(count, max)}
		{@const outside = (firstDay && cell.day < firstDay) || (lastDay && cell.day > lastDay)}
		{@const rect = {
			x: LEFT + cell.x * STEP,
			y: TOP + cell.y * STEP
		}}
		{#if count > 0}
			<a href="/?start={cell.day}">
				<rect
					{...rect}
					width={CELL}
					height={CELL}
					rx="2"
					style:fill={cellFill(color ?? ALL_SERIES_COLOR, STRENGTH[level])}
				>
					<title>{cell.day}: {count.toLocaleString('de-DE')} Aktivitäten</title>
				</rect>
			</a>
		{:else}
			<rect
				{...rect}
				width={CELL}
				height={CELL}
				rx="2"
				class="fill-base-content {gapDays.has(cell.day) ? 'stroke-error' : ''}"
				stroke-width={gapDays.has(cell.day) ? 1 : 0}
				opacity={outside ? 0.04 : gapDays.has(cell.day) ? 0.12 : 0.08}
			>
				<title>{cell.day}: keine Daten</title>
			</rect>
		{/if}
	{/each}
</svg>

<script lang="ts">
	import type { CoverageGapDto, CoverageSeriesDto } from '@bytebunker/backend';
	import CoverageYearGrid from './CoverageYearGrid.svelte';
	import { expandDays, formatGap } from './coverageGrid.js';

	interface Props {
		series: CoverageSeriesDto;
		gaps: CoverageGapDto[];
		/** Years to render, ascending. */
		years: number[];
		highlight?: boolean;
	}

	let { series, gaps, years, highlight = false }: Props = $props();

	let max = $derived(Math.max(0, ...Object.values(series.days)));
	let gapDays = $derived(new Set(gaps.flatMap((gap) => expandDays(gap.from, gap.to))));
	let visibleYears = $derived(
		years.filter(
			(year) =>
				series.firstDay !== undefined &&
				series.lastDay !== undefined &&
				year >= Number(series.firstDay.slice(0, 4)) &&
				year <= Number(series.lastDay.slice(0, 4))
		)
	);
</script>

<section
	class="card bg-base-100 border border-neutral-200 shadow {highlight ? 'border-primary' : ''}"
>
	<div class="card-body gap-3 p-4">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="text-lg font-bold">{series.label}</h2>
			<p class="text-base-content/70 text-sm">
				{series.total.toLocaleString('de-DE')} Aktivitäten
				{#if series.firstDay}
					· {series.firstDay} bis {series.lastDay}
				{/if}
			</p>
		</div>

		{#if visibleYears.length === 0}
			<p class="text-base-content/60 text-sm">Keine Daten im gewählten Zeitraum.</p>
		{:else}
			<div class="flex flex-col gap-2 overflow-x-auto">
				{#each visibleYears as year (year)}
					<div class="flex items-start gap-3">
						<span class="text-base-content/70 w-10 pt-4 text-xs">{year}</span>
						<CoverageYearGrid
							{year}
							days={series.days}
							{max}
							{gapDays}
							firstDay={series.firstDay}
							lastDay={series.lastDay}
						/>
					</div>
				{/each}
			</div>
		{/if}

		{#if gaps.length > 0}
			<ul class="text-error text-sm">
				{#each gaps as gap (gap.from)}
					<li>{formatGap(gap)}</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

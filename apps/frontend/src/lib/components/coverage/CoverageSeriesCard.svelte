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
		color?: string;
	}

	let { series, gaps, years, highlight = false, color }: Props = $props();

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
	/** Totals for the shown years only, so a single-year view reports that year. */
	let shown = $derived.by(() => {
		const prefixes = years.map(String);
		const entries = Object.entries(series.days).filter(([day]) =>
			prefixes.includes(day.slice(0, 4))
		);
		return {
			count: entries.reduce((sum, [, count]) => sum + count, 0),
			days: entries.length
		};
	});
</script>

<section
	class="card bg-base-100 border border-neutral-200 shadow {highlight ? 'border-primary' : ''}"
>
	<div class="card-body gap-3 p-4">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="flex items-center gap-2 text-lg font-bold">
				{#if color}
					<span class="inline-block size-3 rounded-sm" style:background-color={color}></span>
				{/if}
				{series.label}
			</h2>
			<p class="text-base-content/70 text-sm">
				{#if years.length === 1}
					{shown.count.toLocaleString('de-DE')} Aktivitäten · {shown.days} Tage mit Daten
				{:else}
					{series.total.toLocaleString('de-DE')} Aktivitäten
				{/if}
				{#if series.firstDay}
					· gesamt {series.firstDay} bis {series.lastDay}
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
							{color}
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

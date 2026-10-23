<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { CoverageGapDto, CoverageGroupBy } from '@bytebunker/backend';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import CoverageSeriesCard from '$lib/components/coverage/CoverageSeriesCard.svelte';
	import CoverageMonthBand, {
		type CoverageMetric,
		type MonthBandRow
	} from '$lib/components/coverage/CoverageMonthBand.svelte';
	import {
		buildMonthBuckets,
		ALL_SERIES_COLOR,
		seriesColor,
		yearSpan
	} from '$lib/components/coverage/coverageGrid.js';
	import { CoverageApi } from '$lib/api/CoverageApi.js';
	import LucideChartNoAxesGantt from '~icons/lucide/chart-no-axes-gantt';
	import LucideChevronLeft from '~icons/lucide/chevron-left';
	import LucideChevronRight from '~icons/lucide/chevron-right';

	let groupBy = $state<CoverageGroupBy>('type');
	let metric = $state<CoverageMetric>('days');
	let minGapDays = $state(14);
	/** Undefined until the user picks one: then the latest year with data is shown. */
	let pickedYear = $state<number>();

	const coverageQuery = createQuery(() => ({
		queryKey: ['coverage', groupBy, minGapDays],
		queryFn: () => CoverageApi.load({ groupBy, minGapDays }),
		staleTime: 2 * 60 * 1000
	}));

	let data = $derived(coverageQuery.data);
	let years = $derived(yearSpan(data?.overall.firstDay, data?.overall.lastDay));
	let year = $derived(
		pickedYear !== undefined && years.includes(pickedYear) ? pickedYear : years.at(-1)
	);
	/** Colour per series key, in the order the backend sorts them (largest first). */
	let colors = $derived(
		new Map((data?.series ?? []).map((series, i) => [series.key, seriesColor(i)]))
	);
	let rows = $derived<MonthBandRow[]>(
		data
			? [
					{
						key: data.overall.key,
						label: 'Alle',
						color: ALL_SERIES_COLOR,
						buckets: buildMonthBuckets(data.overall.days, years)
					},
					...data.series.map((series) => ({
						key: series.key,
						label: series.label,
						color: colors.get(series.key) ?? seriesColor(0),
						buckets: buildMonthBuckets(series.days, years)
					}))
				]
			: []
	);
	let yearSeries = $derived(
		(data?.series ?? []).filter(
			(series) =>
				year !== undefined &&
				series.firstDay !== undefined &&
				series.lastDay !== undefined &&
				Number(series.firstDay.slice(0, 4)) <= year &&
				Number(series.lastDay.slice(0, 4)) >= year
		)
	);
	let yearStats = $derived.by(() => {
		if (!data || year === undefined) {
			return undefined;
		}
		const prefix = String(year);
		const entries = Object.entries(data.overall.days).filter(([day]) => day.startsWith(prefix));
		return {
			count: entries.reduce((sum, [, count]) => sum + count, 0),
			days: entries.length,
			daysInYear: (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000
		};
	});

	function gapsInYear(key: string): CoverageGapDto[] {
		if (!data || year === undefined) {
			return [];
		}
		const start = `${year}-01-01`;
		const end = `${year}-12-31`;
		return data.gaps.filter((gap) => gap.key === key && gap.from <= end && gap.to >= start);
	}

	function step(delta: number) {
		if (year === undefined) {
			return;
		}
		const next = year + delta;
		if (years.includes(next)) {
			pickedYear = next;
		}
	}

	const groupOptions: { value: CoverageGroupBy; label: string }[] = [
		{ value: 'type', label: 'Aktivitätstyp' },
		{ value: 'source', label: 'Quelle' }
	];
	const metricOptions: { value: CoverageMetric; label: string }[] = [
		{ value: 'days', label: 'Tage mit Daten' },
		{ value: 'count', label: 'Aktivitäten' }
	];
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
			return;
		}
		if (event.key === 'ArrowLeft') step(-1);
		if (event.key === 'ArrowRight') step(1);
	}}
/>

<MainLayout icon={LucideChartNoAxesGantt} title="Datenabdeckung">
	<div class="mb-4 flex flex-wrap items-center gap-4">
		<div class="join">
			{#each groupOptions as option (option.value)}
				<button
					class="btn btn-sm join-item {groupBy === option.value ? 'btn-primary' : ''}"
					onclick={() => (groupBy = option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
		<div class="join">
			{#each metricOptions as option (option.value)}
				<button
					class="btn btn-sm join-item {metric === option.value ? 'btn-neutral' : ''}"
					onclick={() => (metric = option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
		<label class="flex items-center gap-2 text-sm">
			Lücke ab
			<input
				type="number"
				min="1"
				class="input input-sm w-20"
				bind:value={minGapDays}
				onchange={() => (minGapDays = Math.max(1, Math.floor(minGapDays || 14)))}
			/>
			Tagen
		</label>
	</div>

	{#if coverageQuery.isPending}
		<span class="loading loading-spinner"></span>
	{:else if coverageQuery.isError}
		<div class="alert alert-error">Datenabdeckung konnte nicht geladen werden.</div>
	{:else if data && years.length === 0}
		<p class="text-base-content/60">Noch keine Aktivitäten vorhanden.</p>
	{:else if data && year !== undefined}
		<div class="flex flex-col gap-4 pb-8">
			<section class="card bg-base-100 border border-neutral-200 shadow">
				<div class="card-body gap-2 p-4">
					<p class="text-base-content/70 text-sm">
						{metric === 'days'
							? 'Farbe = Anteil der Tage mit Daten im Monat.'
							: 'Farbe = Aktivitäten im Monat (logarithmisch, je Zeile auf den stärksten Monat bezogen).'}
						Jahr anklicken für die Tagesansicht.
					</p>
					<CoverageMonthBand
						{rows}
						{years}
						{metric}
						selectedYear={year}
						onselect={(selected) => (pickedYear = selected)}
					/>
				</div>
			</section>

			<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
				<div class="flex items-center gap-1">
					<button
						class="btn btn-ghost btn-sm btn-square"
						aria-label="Vorheriges Jahr"
						disabled={!years.includes(year - 1)}
						onclick={() => step(-1)}
					>
						<LucideChevronLeft class="size-4" />
					</button>
					<h2 class="text-xl font-bold">{year}</h2>
					<button
						class="btn btn-ghost btn-sm btn-square"
						aria-label="Nächstes Jahr"
						disabled={!years.includes(year + 1)}
						onclick={() => step(1)}
					>
						<LucideChevronRight class="size-4" />
					</button>
				</div>
				{#if yearStats}
					<p class="text-base-content/70 text-sm">
						{yearStats.count.toLocaleString('de-DE')} Aktivitäten · {yearStats.days} / {yearStats.daysInYear}
						Tage mit Daten · {yearSeries.length}
						{groupBy === 'type'
							? yearSeries.length === 1
								? 'Typ'
								: 'Typen'
							: yearSeries.length === 1
								? 'Quelle'
								: 'Quellen'} aktiv
					</p>
				{/if}
			</div>

			<CoverageSeriesCard
				series={{ ...data.overall, label: groupBy === 'type' ? 'Alle Typen' : 'Alle Quellen' }}
				gaps={gapsInYear(data.overall.key)}
				years={[year]}
				highlight
			/>
			{#each yearSeries as series (series.key)}
				<CoverageSeriesCard
					{series}
					gaps={gapsInYear(series.key)}
					years={[year]}
					color={colors.get(series.key)}
				/>
			{/each}
		</div>
	{/if}
</MainLayout>

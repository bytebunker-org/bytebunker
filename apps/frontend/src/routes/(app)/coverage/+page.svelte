<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { CoverageGroupBy } from '@bytebunker/backend';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import CoverageSeriesCard from '$lib/components/coverage/CoverageSeriesCard.svelte';
	import { CoverageApi } from '$lib/api/CoverageApi.js';
	import LucideChartNoAxesGantt from '~icons/lucide/chart-no-axes-gantt';

	let groupBy = $state<CoverageGroupBy>('source');
	let year = $state<number | 'all'>('all');
	let minGapDays = $state(14);

	const coverageQuery = createQuery(() => ({
		queryKey: ['coverage', groupBy, minGapDays],
		queryFn: () => CoverageApi.load({ groupBy, minGapDays }),
		staleTime: 2 * 60 * 1000
	}));

	let data = $derived(coverageQuery.data);
	let allYears = $derived.by(() => {
		if (!data?.overall.firstDay || !data.overall.lastDay) {
			return [];
		}
		const first = Number(data.overall.firstDay.slice(0, 4));
		const last = Number(data.overall.lastDay.slice(0, 4));
		return Array.from({ length: last - first + 1 }, (_, i) => first + i);
	});
	let shownYears = $derived(year === 'all' ? allYears : allYears.filter((y) => y === year));

	const groupOptions: { value: CoverageGroupBy; label: string }[] = [
		{ value: 'source', label: 'Quelle' },
		{ value: 'type', label: 'Aktivitätstyp' }
	];
</script>

<MainLayout icon={LucideChartNoAxesGantt} title="Datenabdeckung">
	<div class="mb-4 flex flex-wrap items-center gap-4">
		<div class="join">
			{#each groupOptions as option}
				<button
					class="btn btn-sm join-item {groupBy === option.value ? 'btn-primary' : ''}"
					onclick={() => (groupBy = option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
		<label class="flex items-center gap-2 text-sm">
			Jahr
			<select class="select select-sm" bind:value={year}>
				<option value="all">Alle</option>
				{#each allYears as y}
					<option value={y}>{y}</option>
				{/each}
			</select>
		</label>
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
	{:else if data}
		<div class="flex flex-col gap-4 pb-8">
			<CoverageSeriesCard
				series={{ ...data.overall, label: 'Alle Quellen' }}
				gaps={data.gaps.filter((gap) => gap.key === data.overall.key)}
				years={shownYears}
				highlight
			/>
			{#each data.series as series (series.key)}
				<CoverageSeriesCard
					{series}
					gaps={data.gaps.filter((gap) => gap.key === series.key)}
					years={shownYears}
				/>
			{/each}
			{#if data.series.length === 0}
				<p class="text-base-content/60">Noch keine Aktivitäten vorhanden.</p>
			{/if}
		</div>
	{/if}
</MainLayout>

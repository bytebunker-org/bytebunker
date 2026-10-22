<script lang="ts">
	import type { ActivityGraphSampleDto, StoreActivityReport } from '@bytebunker/backend';
	import { createQuery } from '@tanstack/svelte-query';
	import { DateTime } from 'luxon';
	import { ProvenanceApi } from '$lib/api/ProvenanceApi.js';

	interface Props {
		report: StoreActivityReport;
		executionId: number;
		dryRun: boolean;
	}

	let { report, executionId, dryRun }: Props = $props();

	const provenanceQuery = createQuery(() => ({
		queryKey: ['import-provenance', executionId],
		queryFn: () => ProvenanceApi.byExecution(executionId),
		enabled: !dryRun,
		staleTime: 60 * 1000
	}));

	const nf = new Intl.NumberFormat('de-DE');

	function formatNumber(value: number | undefined): string {
		return nf.format(value ?? 0);
	}

	function formatDate(value: unknown): string {
		if (!value) {
			return '–';
		}
		const date = DateTime.isDateTime(value) ? value : DateTime.fromISO(String(value));
		return date.isValid ? date.toLocaleString(DateTime.DATETIME_MED) : String(value);
	}

	interface ProblemInfo {
		label: string;
		explanation: string;
		hard: boolean;
	}

	const problemInfo: Record<string, ProblemInfo> = {
		unknownRelationshipKeys: {
			label: 'Unbekannte Beziehungen',
			explanation: 'Beziehungsnamen, die es im Graph nicht gibt. Das Speichern bricht damit ab.',
			hard: true
		},
		missingType: {
			label: 'Typ fehlt',
			explanation: 'Aktivitäten ohne Typ. Das Speichern bricht damit ab.',
			hard: true
		},
		missingActor: {
			label: 'Akteur fehlt',
			explanation: 'Aktivitäten ohne Akteur. Das Speichern bricht damit ab.',
			hard: true
		},
		missingOrInvalidStartTime: {
			label: 'Startzeit fehlt oder ungültig',
			explanation: 'Jede Aktivität braucht eine gültige Startzeit. Das Speichern bricht damit ab.',
			hard: true
		},
		stableKeysTooLong: {
			label: 'Stable Keys zu lang',
			explanation: 'Abgeschnittene Schlüssel können im Duplikat-Index kollidieren.',
			hard: true
		},
		activitiesWithoutStableKeys: {
			label: 'Aktivitäten ohne Stable Key',
			explanation: 'Diese Aktivitäten werden bei erneutem Import nie als Duplikat erkannt.',
			hard: false
		},
		endBeforeStart: {
			label: 'Ende vor Start',
			explanation: 'Die Endzeit liegt vor der Startzeit.',
			hard: false
		},
		intraFileDuplicateActivityKeys: {
			label: 'Doppelte Schlüssel in der Datei',
			explanation:
				'Aktivitäten teilen sich einen Stable Key mit einer früheren Aktivität derselben Datei. Alle werden angelegt, der Index behält nur eine. Entweder sind es Duplikate oder der Schlüssel ist zu grob.',
			hard: false
		},
		intraFileConflictingActivityKeys: {
			label: 'Schlüssel mit abweichendem Inhalt',
			explanation:
				'Gleicher Schlüssel, aber unterschiedliche Daten: Der Schlüssel kann die Ereignisse nicht unterscheiden.',
			hard: false
		},
		objectsWithoutStableKeys: {
			label: 'Objekte ohne Stable Key',
			explanation: 'Für jede Aktivität entsteht ein neuer Objektknoten.',
			hard: false
		},
		objectsWithConflictingKeySets: {
			label: 'Objekte mit widersprüchlichen Schlüsseln',
			explanation:
				'Schlüssel verbinden eigentlich getrennte Identitäten. Die Objekte werden unvorhersehbar zusammengeführt.',
			hard: false
		},
		stringifiedProperties: {
			label: 'Verschachtelte Werte als Text',
			explanation: 'Verschachtelte Werte werden per JSON.stringify zu Text abgeflacht.',
			hard: false
		}
	};

	interface Problem extends ProblemInfo {
		key: string;
		count: number;
		details?: [string, number][];
		examples: unknown[];
	}

	let problems = $derived.by<Problem[]>(() => {
		const result: Problem[] = [];

		for (const [key, value] of Object.entries(report.analysis.problems)) {
			const info = problemInfo[key] ?? { label: key, explanation: '', hard: false };
			const details =
				typeof value === 'number'
					? undefined
					: (Object.entries(value as Record<string, number>) as [string, number][]);
			const count =
				typeof value === 'number' ? value : (details ?? []).reduce((sum, [, n]) => sum + n, 0);

			if (count > 0) {
				result.push({
					...info,
					key,
					count,
					details,
					examples: report.analysis.examples?.[key] ?? []
				});
			}
		}

		return result.sort((a, b) => Number(b.hard) - Number(a.hard) || b.count - a.count);
	});

	let activityTypes = $derived(
		Object.entries(report.analysis.byType ?? {}).sort((a, b) => b[1] - a[1])
	);

	let provenanceLabels = $derived(
		Object.entries(provenanceQuery.data?.nodeCounts ?? {}).sort((a, b) => b[1] - a[1])
	);

	let createdWord = $derived(dryRun ? 'würden angelegt' : 'angelegt');

	function describeSample(sample: ActivityGraphSampleDto): string {
		return (
			sample.summary ??
			Object.entries(sample.objects ?? {})
				.map(([role, name]) => `${role}: ${name}`)
				.join(', ')
		);
	}
</script>

{#snippet sampleList(title: string, samples: ActivityGraphSampleDto[])}
	<div class="collapse-arrow border-base-300 bg-base-100 collapse border">
		<input type="checkbox" />
		<div class="collapse-title text-sm font-semibold">{title} ({samples.length})</div>
		<div class="collapse-content overflow-x-auto">
			{#if samples.length}
				<table class="table-xs table">
					<thead>
						<tr><th>Typ</th><th>Zeit</th><th>Beschreibung</th></tr>
					</thead>
					<tbody>
						{#each samples as sample}
							<tr>
								<td class="whitespace-nowrap">{sample.type}</td>
								<td class="whitespace-nowrap">{formatDate(sample.startTime)}</td>
								<td>{describeSample(sample)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="text-sm opacity-70">Keine Beispiele.</p>
			{/if}
		</div>
	</div>
{/snippet}

<div class="rounded-box border-base-300 bg-base-100 flex flex-col gap-4 border p-4 shadow-sm">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">Importbericht</h2>
		{#if dryRun}
			<span class="badge badge-sm badge-warning">Dry Run</span>
		{/if}
	</div>

	<div class="stats stats-vertical sm:stats-horizontal border-base-300 border">
		<div class="stat">
			<div class="stat-title">Aktivitäten {createdWord}</div>
			<div class="stat-value text-success">{formatNumber(report.createdCount)}</div>
			<div class="stat-desc">von {formatNumber(report.activityCount)} empfangenen</div>
		</div>
		<div class="stat">
			<div class="stat-title">Bereits vorhanden</div>
			<div class="stat-value">{formatNumber(report.existingCount)}</div>
			<div class="stat-desc">werden übersprungen</div>
		</div>
		<div class="stat">
			<div class="stat-title">Neue Objekte {dryRun ? 'würden entstehen' : ''}</div>
			<div class="stat-value">{formatNumber(report.createdObjectCount)}</div>
			<div class="stat-desc">
				Orte, Tracks, Videos …
				{#if report.analysis.objects}
					({formatNumber(report.analysis.objects.distinct)} verschiedene referenziert)
				{/if}
			</div>
		</div>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="flex flex-col gap-1">
			<h3 class="text-sm font-semibold">Aktivitätstypen</h3>
			{#if activityTypes.length}
				<table class="table-xs table">
					<tbody>
						{#each activityTypes as [type, count]}
							<tr>
								<td>{type}</td>
								<td class="text-right tabular-nums">{formatNumber(count)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="text-sm opacity-70">Keine Aktivitäten.</p>
			{/if}
		</div>
		<div class="flex flex-col gap-1">
			<h3 class="text-sm font-semibold">Zeitraum</h3>
			<p class="text-sm">
				{formatDate(report.analysis.timeRange?.min)} bis {formatDate(
					report.analysis.timeRange?.max
				)}
			</p>
		</div>
	</div>

	<div class="flex flex-col gap-2">
		{@render sampleList(
			dryRun ? 'Beispiele: würden angelegt' : 'Beispiele: angelegt',
			report.samples?.created ?? []
		)}
		{@render sampleList('Beispiele: bereits vorhanden', report.samples?.existing ?? [])}
	</div>

	<div class="flex flex-col gap-2">
		<h3 class="text-sm font-semibold">Datenqualität</h3>
		{#if problems.length}
			{#each problems as problem (problem.key)}
				<div
					class={[
						'collapse-arrow collapse border',
						problem.hard ? 'border-error/50 bg-error/5' : 'border-warning/50 bg-warning/5'
					]}
				>
					<input type="checkbox" />
					<div class="collapse-title flex items-center gap-2 text-sm font-semibold">
						<span class={['badge badge-sm', problem.hard ? 'badge-error' : 'badge-warning']}>
							{formatNumber(problem.count)}
						</span>
						{problem.label}
					</div>
					<div class="collapse-content flex flex-col gap-2 text-sm">
						<p>{problem.explanation}</p>
						{#if problem.details?.length}
							<ul class="list-inside list-disc">
								{#each problem.details.slice(0, 20) as [name, count]}
									<li>{name}: {formatNumber(count)}</li>
								{/each}
							</ul>
						{/if}
						{#if problem.examples.length}
							<pre class="bg-base-200 max-h-64 overflow-auto rounded p-2 text-xs">{JSON.stringify(
									problem.examples,
									null,
									2
								)}</pre>
						{/if}
					</div>
				</div>
			{/each}
		{:else}
			<p class="text-success text-sm">Keine Probleme gefunden.</p>
		{/if}
	</div>

	{#if !dryRun}
		<div class="flex flex-col gap-1">
			<h3 class="text-sm font-semibold">Herkunft (Provenienz)</h3>
			{#if provenanceQuery.isPending}
				<span class="loading loading-spinner loading-sm"></span>
			{:else if provenanceQuery.isError}
				<p class="text-sm opacity-70">Provenienz konnte nicht geladen werden.</p>
			{:else if provenanceQuery.data}
				<p class="text-sm">
					{formatNumber(provenanceQuery.data.activityCount)} Aktivitäten und
					{formatNumber(provenanceQuery.data.objectCount)} Objekte stammen aus dieser Ausführung
					{#if provenanceQuery.data.firstActivityAt}
						({formatDate(provenanceQuery.data.firstActivityAt)} bis
						{formatDate(provenanceQuery.data.lastActivityAt)}).
					{/if}
				</p>
				<div class="flex flex-wrap gap-1">
					{#each provenanceLabels as [label, count]}
						<span class="badge badge-outline badge-sm">{label}: {formatNumber(count)}</span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

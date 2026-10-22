<script lang="ts">
	import type { FileImportBatchResultDto, FileImportOutcome } from '@bytebunker/backend';
	import { PipelineExecutionStatusEnum } from '@bytebunker/backend';
	import { toastManager } from '$lib/util/toastManager.svelte.js';
	import { ImportApi } from '$lib/api/ImportApi.js';
	import ExecutionProgressBar from './ExecutionProgressBar.svelte';
	import { formatBytes } from './collectFiles.js';

	interface Props {
		/** Mutated in place when an execution is applied (its executionId is replaced). */
		result: FileImportBatchResultDto;
	}

	let { result = $bindable() }: Props = $props();

	const PAGE_SIZE = 200;

	const outcomeMeta: Record<FileImportOutcome, { label: string; badge: string }> = {
		started: { label: 'Gestartet', badge: 'badge-success' },
		'dry-run': { label: 'Testlauf', badge: 'badge-info' },
		skipped: { label: 'Übersprungen', badge: 'badge-warning' },
		'no-match': { label: 'Kein Importer', badge: 'badge-neutral' },
		ignored: { label: 'Ignoriert', badge: 'badge-ghost' },
		failed: { label: 'Fehlgeschlagen', badge: 'badge-error' }
	};
	const outcomeOrder = Object.keys(outcomeMeta) as FileImportOutcome[];

	let hidden = $state<Set<FileImportOutcome>>(new Set(['ignored']));
	let limit = $state(PAGE_SIZE);
	/** Latest polled status per execution id. */
	let statuses = $state<Record<number, PipelineExecutionStatusEnum>>({});
	/** Execution ids that are already real runs (created by apply). */
	let applied = $state<Set<number>>(new Set());
	let applying = $state<Set<number>>(new Set());

	let visibleFiles = $derived(result.files.filter((file) => !hidden.has(file.outcome)));
	let shownFiles = $derived(visibleFiles.slice(0, limit));

	function isPending(executionId: number | undefined): executionId is number {
		return result.dryRun && executionId !== undefined && !applied.has(executionId);
	}

	let applicable = $derived(
		result.files.flatMap((file) =>
			file.executions
				.filter(
					(execution) =>
						execution.status === 'created' &&
						isPending(execution.executionId) &&
						statuses[execution.executionId!] === PipelineExecutionStatusEnum.SUCCESS
				)
				.map((execution) => execution)
		)
	);

	function toggle(outcome: FileImportOutcome) {
		const next = new Set(hidden);
		if (next.has(outcome)) next.delete(outcome);
		else next.add(outcome);
		hidden = next;
		limit = PAGE_SIZE;
	}

	async function apply(execution: { executionId?: number }): Promise<boolean> {
		const oldId = execution.executionId;
		if (oldId === undefined) return false;
		applying = new Set(applying).add(oldId);
		try {
			const created = await ImportApi.apply(oldId);
			// Mutating the (deeply reactive) result replaces the link in the row
			execution.executionId = created.id;
			applied = new Set(applied).add(created.id);
			return true;
		} catch (error) {
			console.error(error);
			toastManager.showError(`Anwenden von Ausführung #${oldId} fehlgeschlagen`);
			return false;
		} finally {
			const next = new Set(applying);
			next.delete(oldId);
			applying = next;
		}
	}

	async function applyAll() {
		// Copy: apply() mutates the executions, which changes the derived list
		const targets = [...applicable];
		let ok = 0;
		for (const execution of targets) {
			if (await apply(execution)) ok++;
		}
		if (ok > 0) toastManager.showSuccess(`${ok} Ausführung(en) angewendet`);
	}

	function formatConfidence(confidence: number): string {
		return `${Math.round(confidence * 100)} %`;
	}

	const matchedByLabel = {
		glob: 'Dateiname',
		'content-pattern': 'Inhaltsmuster',
		'content-detection': 'Inhaltserkennung'
	} as const;
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="text-sm">
			{#if result.dryRun}<span class="badge badge-info badge-sm mr-1">Testlauf</span>{/if}
			{result.files.length} Dateien:
			{#each outcomeOrder.filter((outcome) => result.summary[outcome]) as outcome, i}
				{i > 0 ? ', ' : ''}<strong>{result.summary[outcome]}</strong>
				{outcomeMeta[outcome].label.toLowerCase()}
			{/each}
		</p>
		{#if result.dryRun}
			<button class="btn btn-primary btn-sm" disabled={applicable.length === 0} onclick={applyAll}>
				Alle anwenden{applicable.length > 0 ? ` (${applicable.length})` : ''}
			</button>
		{/if}
	</div>

	<div class="flex flex-wrap gap-2">
		{#each outcomeOrder.filter((outcome) => result.summary[outcome]) as outcome}
			<button
				class="badge badge-lg cursor-pointer {hidden.has(outcome)
					? 'badge-outline opacity-60'
					: outcomeMeta[outcome].badge}"
				title={hidden.has(outcome) ? 'Einblenden' : 'Ausblenden'}
				onclick={() => toggle(outcome)}
			>
				{outcomeMeta[outcome].label}
				{result.summary[outcome]}
			</button>
		{/each}
	</div>

	{#if visibleFiles.length === 0}
		<div class="text-base-content/60 py-8 text-center">
			Keine Dateien in der aktuellen Auswahl. Blende oben weitere Ergebnisse ein.
		</div>
	{:else}
		<div class="bg-base-100 rounded-box overflow-x-auto">
			<table class="table-sm table">
				<thead>
					<tr>
						<th>Datei</th>
						<th class="text-right">Größe</th>
						<th>Ergebnis</th>
						<th>Format</th>
						<th>Blueprint / Ausführung</th>
						<th>Hinweis</th>
					</tr>
				</thead>
				<tbody>
					{#each shownFiles as file}
						<tr>
							<td class="max-w-80 break-all" title={file.relativePath}>{file.relativePath}</td>
							<td class="text-right whitespace-nowrap">{formatBytes(file.size)}</td>
							<td>
								<span class="badge badge-sm {outcomeMeta[file.outcome].badge}">
									{outcomeMeta[file.outcome].label}
								</span>
							</td>
							<td>
								{#if file.format}
									<div>{file.format}</div>
									<div class="text-base-content/60 text-xs">
										{#if file.confidence !== undefined}{formatConfidence(file.confidence)}{/if}
										{#if file.matchedBy}· {matchedByLabel[file.matchedBy]}{/if}
									</div>
									{#if file.unsupportedFormat}
										<div class="text-warning text-xs">noch kein Importer</div>
									{/if}
								{:else}
									<span class="text-base-content/40">–</span>
								{/if}
							</td>
							<td>
								<div class="flex flex-col gap-2">
									{#each file.executions as execution}
										<div class="flex flex-wrap items-center gap-2">
											<span class="font-medium">{execution.blueprintTitle}</span>
											{#if execution.executionId !== undefined}
												<a
													class="link link-primary text-xs"
													href="/pipelines/{execution.executionId}"
												>
													#{execution.executionId}
												</a>
												<ExecutionProgressBar
													executionId={execution.executionId}
													onstatus={(status) => {
														if (execution.executionId !== undefined) {
															statuses[execution.executionId] = status;
														}
													}}
												/>
												{#if isPending(execution.executionId)}
													<button
														class="btn btn-xs btn-primary"
														disabled={applying.has(execution.executionId) ||
															statuses[execution.executionId] !==
																PipelineExecutionStatusEnum.SUCCESS}
														onclick={() => apply(execution)}
													>
														{#if applying.has(execution.executionId)}
															<span class="loading loading-spinner loading-xs"></span>
														{/if}
														Anwenden
													</button>
												{:else if applied.has(execution.executionId)}
													<span class="badge badge-success badge-sm">angewendet</span>
												{/if}
											{:else}
												<span class="badge badge-sm badge-warning">{execution.status}</span>
											{/if}
											{#if execution.reason}
												<span class="text-base-content/60 text-xs">{execution.reason}</span>
											{/if}
										</div>
									{:else}
										<span class="text-base-content/40">–</span>
									{/each}
								</div>
							</td>
							<td class="text-base-content/70 max-w-72 text-xs">{file.message ?? ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if visibleFiles.length > shownFiles.length}
			<button class="btn btn-sm self-center" onclick={() => (limit += PAGE_SIZE)}>
				Weitere anzeigen ({visibleFiles.length - shownFiles.length} übrig)
			</button>
		{/if}
	{/if}
</div>

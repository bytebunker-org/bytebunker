<script lang="ts">
	import type { PipelineExecutionDto, PipelineProgressDto } from '@bytebunker/backend';
	import { PipelineExecutionStatusEnum } from '@bytebunker/backend';
	import { DateTime } from 'luxon';
	import PipelineStatusBadge from '$lib/components/pipeline/PipelineStatusBadge.svelte';
	import { isTerminalStatus } from '$lib/components/pipeline/execution/pipelineProgress.svelte.js';

	interface Props {
		execution: PipelineExecutionDto;
		progress?: PipelineProgressDto;
	}

	let { execution, progress }: Props = $props();

	let status = $derived(progress?.executionStatus ?? execution.executionStatus);
	let finished = $derived(isTerminalStatus(status));
	let dryRun = $derived(progress?.dryRun ?? execution.dryRun);
	let fraction = $derived(
		status === PipelineExecutionStatusEnum.SUCCESS ? 1 : Math.min(1, progress?.fraction ?? 0)
	);
	let percent = $derived(Math.round(fraction * 100));

	let now = $state(Date.now());

	$effect(() => {
		if (finished) {
			return;
		}
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	let startMs = $derived(
		DateTime.isDateTime(execution.createdAt)
			? execution.createdAt.toMillis()
			: DateTime.fromISO(String(execution.createdAt)).toMillis()
	);
	// Finished executions: time between creation and the last update
	let endMs = $derived(
		finished
			? DateTime.isDateTime(execution.updatedAt)
				? execution.updatedAt.toMillis()
				: DateTime.fromISO(String(execution.updatedAt)).toMillis()
			: now
	);

	function formatDuration(ms: number): string {
		const total = Math.max(0, Math.floor(ms / 1000));
		const h = Math.floor(total / 3600);
		const m = Math.floor((total % 3600) / 60);
		const s = total % 60;

		if (h > 0) {
			return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
		}
		return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
	}
</script>

<div class="rounded-box border-base-300 bg-base-100 flex flex-col gap-2 border p-3 shadow-sm">
	<div class="flex flex-wrap items-center gap-2">
		<PipelineStatusBadge {status} />
		{#if dryRun}
			<span class="badge badge-sm badge-warning" title="Dry Run: es wird nichts geschrieben">
				Dry Run
			</span>
		{/if}
		<span class="text-sm font-semibold tabular-nums">{percent} %</span>
		<span class="text-base-content/70 min-w-0 flex-1 truncate text-sm">
			{progress?.message ?? ''}
		</span>
		<span class="text-base-content/70 text-sm tabular-nums" title="Laufzeit">
			{formatDuration(endMs - startMs)}
		</span>
	</div>
	<progress
		class={[
			'progress h-2 w-full',
			status === PipelineExecutionStatusEnum.FAILED
				? 'progress-error'
				: status === PipelineExecutionStatusEnum.SUCCESS
					? 'progress-success'
					: 'progress-primary'
		]}
		value={fraction * 100}
		max="100"
	></progress>
</div>

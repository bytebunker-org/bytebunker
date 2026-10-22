<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { PipelineExecutionStatusEnum } from '@bytebunker/backend';
	import { ImportApi } from '$lib/api/ImportApi.js';

	interface Props {
		executionId: number;
		/** Called whenever the polled status changes. */
		onstatus?: (status: PipelineExecutionStatusEnum) => void;
	}

	let { executionId, onstatus }: Props = $props();

	const finished = [
		PipelineExecutionStatusEnum.SUCCESS,
		PipelineExecutionStatusEnum.FAILED,
		PipelineExecutionStatusEnum.ABORTED,
		PipelineExecutionStatusEnum.BRANCH_IGNORED
	];

	const progressQuery = createQuery(() => ({
		queryKey: ['pipeline-progress', executionId],
		queryFn: () => ImportApi.progress(executionId),
		refetchInterval: (query) =>
			query.state.data && finished.includes(query.state.data.executionStatus) ? false : 1500
	}));

	let status = $derived(progressQuery.data?.executionStatus);
	let percent = $derived(Math.round((progressQuery.data?.fraction ?? 0) * 100));

	$effect(() => {
		if (status) onstatus?.(status);
	});
</script>

<div class="flex min-w-32 flex-col gap-0.5" title={progressQuery.data?.message}>
	{#if progressQuery.isError}
		<span class="text-error text-xs">Fortschritt nicht verfügbar</span>
	{:else}
		<progress
			class="progress w-32
				{status === PipelineExecutionStatusEnum.FAILED || status === PipelineExecutionStatusEnum.ABORTED
				? 'progress-error'
				: status === PipelineExecutionStatusEnum.SUCCESS
					? 'progress-success'
					: 'progress-primary'}"
			value={status === PipelineExecutionStatusEnum.SUCCESS ? 100 : percent}
			max="100"
		></progress>
		<span class="text-base-content/60 truncate text-xs">
			{#if !status}
				…
			{:else if status === PipelineExecutionStatusEnum.WAITING}
				{percent}%{progressQuery.data?.message ? ` · ${progressQuery.data.message}` : ''}
			{:else}
				{status}
			{/if}
		</span>
	{/if}
</div>

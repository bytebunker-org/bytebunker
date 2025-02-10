<script lang="ts">
	import { PipelineExecutionStatusEnum } from '@bytebunker/backend';

	interface Props {
		status: PipelineExecutionStatusEnum;
	}

	let { status }: Props = $props();
</script>

{#if status === PipelineExecutionStatusEnum.WAITING}
	<div class="badge badge-sm" style="--badge-color: var(--color-indigo-400)">Waiting</div>
{:else if status === PipelineExecutionStatusEnum.SUCCESS}
	<div class="badge badge-sm badge-success">Success</div>
{:else if status === PipelineExecutionStatusEnum.ABORTED}
	<div class="badge badge-sm text-white" style="--badge-color: var(--color-neutral-700)">
		Aborted
	</div>
{:else if status === PipelineExecutionStatusEnum.FAILED}
	<div class="badge badge-sm badge-error">Failed</div>
{:else if status === PipelineExecutionStatusEnum.BRANCH_IGNORED}
	<div class="badge badge-sm text-white" style="--badge-color: var(--color-neutral-400)">
		Branch Ignored
	</div>
{/if}

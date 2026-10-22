<script lang="ts">
	import type { BlueprintDataDto, BlueprintValidationIssueDto } from '@bytebunker/backend';
	import LucideCircleAlert from '~icons/lucide/circle-alert';
	import LucideTriangleAlert from '~icons/lucide/triangle-alert';
	import { issueNodeIds } from '$lib/components/pipeline/validation/blueprintValidation.js';

	interface Props {
		issues: BlueprintValidationIssueDto[];

		/** Used to resolve the nodes an edge issue belongs to. */
		data?: Pick<BlueprintDataDto, 'edges'>;

		/** If set, issues with a node reference are clickable. */
		onfocusnode?: (nodeId: number) => void;
	}

	let { issues, data, onfocusnode }: Props = $props();

	let groups = $derived([
		{
			severity: 'error' as const,
			label: 'Fehler',
			items: issues.filter((i) => i.severity === 'error')
		},
		{
			severity: 'warning' as const,
			label: 'Warnungen',
			items: issues.filter((i) => i.severity === 'warning')
		}
	]);

	function reference(issue: BlueprintValidationIssueDto): string {
		if (issue.nodeId !== undefined) {
			return `Node ${issue.nodeId}`;
		}

		if (issue.edgeId !== undefined) {
			return `Kante ${issue.edgeId}`;
		}

		return 'Allgemein';
	}
</script>

<div class="flex flex-col gap-3">
	{#each groups as group (group.severity)}
		{#if group.items.length}
			<div>
				<h4
					class="mb-1 flex items-center gap-1 text-sm font-bold {group.severity === 'error'
						? 'text-error'
						: 'text-warning'}"
				>
					{#if group.severity === 'error'}
						<LucideCircleAlert class="size-4" />
					{:else}
						<LucideTriangleAlert class="size-4" />
					{/if}
					{group.label} ({group.items.length})
				</h4>
				<ul class="flex flex-col gap-1">
					{#each group.items as issue, index (index)}
						{@const nodeIds = issueNodeIds(issue, data)}
						<li
							class="rounded-box border-base-300 bg-base-200/50 flex items-start gap-2 border px-2 py-1 text-sm"
						>
							{#if onfocusnode && nodeIds.length}
								<button
									class="badge badge-sm {group.severity === 'error'
										? 'badge-error'
										: 'badge-warning'} shrink-0 cursor-pointer"
									title="Im Editor anzeigen"
									onclick={() => onfocusnode(nodeIds[0])}
								>
									{reference(issue)}
								</button>
							{:else}
								<span class="badge badge-sm badge-ghost shrink-0">{reference(issue)}</span>
							{/if}
							<span class="min-w-0 break-words">
								{issue.message}
								<code class="text-base-content/50 ml-1 text-xs">{issue.code}</code>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/each}
</div>

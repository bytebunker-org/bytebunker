<script lang="ts">
	import type { BlueprintDataDto, BlueprintValidationResultDto } from '@bytebunker/backend';
	import { Card, CardBody } from '@bytebunker/daisyui-components';
	import LucideListChecks from '~icons/lucide/list-checks';
	import LucideCircleCheck from '~icons/lucide/circle-check';
	import BlueprintIssueList from '$lib/components/pipeline/validation/BlueprintIssueList.svelte';
	import { countIssues } from '$lib/components/pipeline/validation/blueprintValidation.js';

	interface Props {
		result?: BlueprintValidationResultDto;

		/** Data the result belongs to (resolves edge references). */
		data?: BlueprintDataDto;

		validating?: boolean;

		/** Set when the validation request itself failed. */
		error?: string;

		onvalidate: () => void;

		onfocusnode?: (nodeId: number) => void;
	}

	let { result, data, validating = false, error, onvalidate, onfocusnode }: Props = $props();

	let counts = $derived(countIssues(result?.issues ?? []));
</script>

<Card class="bg-base-100 border-base-300 rounded-box border shadow">
	<CardBody class="gap-3 p-4">
		<div class="flex flex-wrap items-center gap-2">
			<h2 class="flex items-center gap-2 font-bold">
				<LucideListChecks class="size-5" />
				Prüfung
			</h2>
			{#if result}
				{#if counts.errors}
					<span class="badge badge-error">{counts.errors} Fehler</span>
				{/if}
				{#if counts.warnings}
					<span class="badge badge-warning">{counts.warnings} Warnungen</span>
				{/if}
				{#if !result.issues.length}
					<span class="badge badge-success gap-1"
						><LucideCircleCheck class="size-3" />Alles in Ordnung</span
					>
				{/if}
			{/if}
			<span class="text-base-content/50 text-sm">
				{#if validating}
					prüft ...
				{:else}
					wird nach Änderungen automatisch geprüft
				{/if}
			</span>
			<button class="btn btn-sm btn-outline ml-auto" onclick={onvalidate} disabled={validating}>
				{#if validating}<span class="loading loading-spinner loading-xs"></span>{/if}
				Prüfen
			</button>
		</div>

		{#if error}
			<div role="alert" class="alert alert-error alert-soft py-2 text-sm">
				Prüfung fehlgeschlagen: {error}
			</div>
		{/if}

		{#if result?.issues.length}
			<BlueprintIssueList issues={result.issues} {data} {onfocusnode} />
		{:else if !result && !validating && !error}
			<p class="text-base-content/60 text-sm">Noch nicht geprüft.</p>
		{/if}
	</CardBody>
</Card>

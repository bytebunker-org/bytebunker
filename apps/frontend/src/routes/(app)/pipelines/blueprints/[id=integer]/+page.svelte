<script lang="ts">
	import BlueprintEditor from '$lib/components/pipeline/BlueprintEditor.svelte';
	import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import { PipelineBlueprintApi } from '$lib/api/PipelineBlueprintApi.js';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import LucideCircuitBoard from '~icons/lucide/circuit-board';
	import LucideSave from '~icons/lucide/save';
	import ToolbarButton from '$lib/components/ToolbarButton.svelte';
	import type {
		BlueprintValidationIssueDto,
		BlueprintValidationResultDto,
		FindOneDto,
		PipelineBlueprintDto,
		UpdatePipelineBlueprintDto
	} from '@bytebunker/backend';
	import { Blueprint, BlueprintDataDto } from '@bytebunker/backend';
	import { toastManager } from '$lib/util/toastManager.svelte.js';
	import { setBlueprintSerializeFunctionContext } from '$lib/components/pipeline/blueprintContext.js';
	import {
		setBlueprintFocusContext,
		type BlueprintFocusStore
	} from '$lib/components/pipeline/validation/blueprintFocusContext.js';
	import {
		groupIssuesByNode,
		countIssues,
		validationDataKey
	} from '$lib/components/pipeline/validation/blueprintValidation.js';
	import BlueprintValidationPanel from '$lib/components/pipeline/validation/BlueprintValidationPanel.svelte';
	import BlueprintDialog from '$lib/components/pipeline/validation/BlueprintDialog.svelte';
	import BlueprintIssueList from '$lib/components/pipeline/validation/BlueprintIssueList.svelte';
	import BlueprintJsonViewDialog from '$lib/components/pipeline/json/BlueprintJsonViewDialog.svelte';
	import BlueprintJsonImportDialog from '$lib/components/pipeline/json/BlueprintJsonImportDialog.svelte';
	import CopyForAiButton from '$lib/components/pipeline/json/CopyForAiButton.svelte';
	import {
		formatBlueprintJson,
		type ParsedBlueprintJson
	} from '$lib/components/pipeline/json/blueprintJson.js';
	import LucideBraces from '~icons/lucide/braces';
	import LucideClipboardPaste from '~icons/lucide/clipboard-paste';

	const queryClient = useQueryClient();

	const blueprintQuery = createQuery(() => ({
		queryKey: [
			'pipeline-blueprint',
			Number(page.params.id),
			{} satisfies FindOneDto<PipelineBlueprintDto>
		],
		queryFn: ({ queryKey }) => PipelineBlueprintApi.findOne(Number(queryKey[1]), queryKey[2])
	}));

	const updateBlueprintMutation = createMutation<
		PipelineBlueprintDto,
		Error,
		UpdatePipelineBlueprintDto & { id: number }
	>(() => ({
		mutationFn: (data) =>
			PipelineBlueprintApi.update(data.id, {
				title: data.title,
				description: data.description,
				data: data.data
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ['pipeline-blueprint', Number(page.params.id)]
			});
		}
	}));

	// Data pasted via "JSON einfügen"; replaces the loaded blueprint in the editor until saved.
	let importedData = $state<BlueprintDataDto>();
	let editorKey = $state(0);

	let blueprint = $derived(
		importedData
			? new Blueprint(importedData)
			: blueprintQuery.data
				? new Blueprint($state.snapshot(blueprintQuery.data.data))
				: undefined
	);

	let serializeFunctionStore = $state<{ current?: () => BlueprintDataDto }>({});
	setBlueprintSerializeFunctionContext(serializeFunctionStore);

	const focusStore = $state<BlueprintFocusStore>({});
	setBlueprintFocusContext(focusStore);

	// Validation
	let validation = $state<{ result: BlueprintValidationResultDto; data: BlueprintDataDto }>();
	let validating = $state(false);
	let validationError = $state<string>();
	let lastValidatedKey: string | undefined;
	let validationRun = 0;

	let nodeIssues = $derived(
		validation ? groupIssuesByNode(validation.result.issues, validation.data) : undefined
	);

	async function runValidation(data: BlueprintDataDto) {
		const run = ++validationRun;

		validating = true;
		validationError = undefined;
		lastValidatedKey = validationDataKey(data);

		try {
			const result = await PipelineBlueprintApi.validate(data);

			if (run === validationRun) {
				validation = { result, data };
			}

			return result;
		} catch (error) {
			console.error(error);

			if (run === validationRun) {
				validationError = error instanceof Error ? error.message : String(error);
				lastValidatedKey = undefined;
			}

			return undefined;
		} finally {
			if (run === validationRun) {
				validating = false;
			}
		}
	}

	function validateNow() {
		const data = serializeFunctionStore.current?.();

		if (data) {
			return runValidation(data);
		}
	}

	// Automatic validation ~800 ms after the last edit
	$effect(() => {
		const serialize = serializeFunctionStore.current;

		if (!serialize) {
			return;
		}

		const timeout = setTimeout(() => {
			const data = serialize();

			if (validationDataKey(data) !== lastValidatedKey) {
				void runValidation(data);
			}
		}, 800);

		return () => clearTimeout(timeout);
	});

	// Save
	let confirmSave = $state<{ data: BlueprintDataDto; issues: BlueprintValidationIssueDto[] }>();
	let confirmSaveOpen = $state(false);

	async function persist(newData: BlueprintDataDto) {
		try {
			const currentBlueprint = blueprintQuery.data!;
			await updateBlueprintMutation.mutateAsync({
				id: currentBlueprint.id,
				title: currentBlueprint.title,
				description: currentBlueprint.description,
				data: newData
			});

			importedData = undefined;
			toastManager.showSuccess('Blueprint wurde gespeichert');
		} catch (error) {
			console.error(error);
			toastManager.showError('Blueprint konnte nicht gespeichert werden!');
		}
	}

	async function saveBlueprint() {
		const newData = serializeFunctionStore.current?.();

		if (!newData) {
			toastManager.showError('Blueprint konnte nicht gespeichert werden!');

			return;
		}

		const result = await runValidation(newData);

		if (!result) {
			toastManager.showError('Blueprint konnte nicht geprüft werden, speichere trotzdem.');
		} else if (!result.valid) {
			confirmSave = { data: newData, issues: result.issues };
			confirmSaveOpen = true;

			return;
		}

		await persist(newData);
	}

	async function saveAnyway() {
		confirmSaveOpen = false;

		if (confirmSave) {
			await persist(confirmSave.data);
		}
	}

	// JSON export / import
	let jsonViewOpen = $state(false);
	let jsonText = $state('');
	let jsonImportOpen = $state(false);

	function showJson() {
		const data = serializeFunctionStore.current?.() ?? blueprintQuery.data?.data;

		if (!data) {
			return;
		}

		jsonText = formatBlueprintJson(data);
		jsonViewOpen = true;
	}

	function applyImport(value: ParsedBlueprintJson) {
		importedData = value.data;
		editorKey++;
		// New editor instance: its serialize function replaces the old one once mounted
		serializeFunctionStore.current = undefined;
		validation = undefined;
		lastValidatedKey = undefined;
		toastManager.showSuccess('JSON wurde übernommen. Zum Übernehmen in die Datenbank speichern.');
	}
</script>

<svelte:head>
	<title>Blueprints</title>
</svelte:head>

<MainLayout
	icon={LucideCircuitBoard}
	title="{blueprintQuery.data?.title} Blueprint"
	breadcrumbs={[
		['Pipelines', '/pipelines'],
		['Blueprints', '/pipelines/blueprints']
	]}
>
	{#snippet toolbar()}
		<CopyForAiButton />
		<ToolbarButton icon={LucideBraces} tooltip="JSON anzeigen/kopieren" onclick={showJson} />
		<ToolbarButton
			icon={LucideClipboardPaste}
			tooltip="JSON einfügen"
			onclick={() => (jsonImportOpen = true)}
		/>
		<ToolbarButton
			icon={LucideSave}
			class="btn-success"
			tooltip="Änderungen speichern"
			onclick={saveBlueprint}
			loading={updateBlueprintMutation.isPending}
		/>
	{/snippet}

	{#if blueprint}
		<div class="flex flex-col gap-4">
			{#key editorKey}
				<BlueprintEditor {blueprint} {nodeIssues} />
			{/key}
			<BlueprintValidationPanel
				result={validation?.result}
				data={validation?.data}
				{validating}
				error={validationError}
				onvalidate={validateNow}
				onfocusnode={(nodeId) => focusStore.current?.(nodeId)}
			/>
		</div>
	{/if}
</MainLayout>

<BlueprintJsonViewDialog
	bind:open={jsonViewOpen}
	json={jsonText}
	fileName={blueprintQuery.data?.title}
/>
<BlueprintJsonImportDialog bind:open={jsonImportOpen} mode="replace" onsubmit={applyImport} />

<BlueprintDialog bind:open={confirmSaveOpen} title="Blueprint enthält Fehler">
	{#if confirmSave}
		<p class="text-sm">
			Die Prüfung hat {countIssues(confirmSave.issues).errors} Fehler gefunden. Ein fehlerhafter Blueprint
			kann sich nicht ausführen lassen.
		</p>
		<BlueprintIssueList
			issues={confirmSave.issues}
			data={confirmSave.data}
			onfocusnode={(nodeId) => {
				confirmSaveOpen = false;
				focusStore.current?.(nodeId);
			}}
		/>
	{/if}

	{#snippet actions()}
		<button class="btn btn-ghost" onclick={() => (confirmSaveOpen = false)}
			>Zurück zum Editor</button
		>
		<button class="btn btn-warning" onclick={saveAnyway}>Trotzdem speichern?</button>
	{/snippet}
</BlueprintDialog>

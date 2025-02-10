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
		FindOneDto,
		PipelineBlueprintDto,
		UpdatePipelineBlueprintDto
	} from '@bytebunker/backend';
	import { Blueprint, BlueprintDataDto } from '@bytebunker/backend';
	import { toastManager } from '$lib/util/toastManager.svelte.js';
	import { setBlueprintSerializeFunctionContext } from '$lib/components/pipeline/blueprintContext.js';

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

	let blueprint = $derived(
		blueprintQuery.data ? new Blueprint($state.snapshot(blueprintQuery.data.data)) : undefined
	);

	async function saveBlueprint() {
		const newData = serializeFunctionStore.current?.();

		if (!newData) {
			toastManager.showError('Blueprint konnte nicht gespeichert werden!');

			return;
		}

		try {
			const currentBlueprint = blueprintQuery.data!;
			await updateBlueprintMutation.mutateAsync({
				id: currentBlueprint.id,
				title: currentBlueprint.title,
				description: currentBlueprint.description,
				data: newData
			});

			toastManager.showSuccess('Blueprint wurde gespeichert');
		} catch (error) {
			console.error(error);
			toastManager.showError('Blueprint konnte nicht gespeichert werden!');
		}
	}

	let serializeFunctionStore = $state<{ current?: () => BlueprintDataDto }>({});
	setBlueprintSerializeFunctionContext(serializeFunctionStore);
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
		<ToolbarButton
			icon={LucideSave}
			class="btn-success"
			tooltip="Änderungen speichern"
			onclick={saveBlueprint}
			loading={updateBlueprintMutation.isPending}
		/>
	{/snippet}

	{#if blueprint}
		<BlueprintEditor {blueprint} />
	{/if}
</MainLayout>

<script lang="ts">
	import { Card, CardBody } from '@bytebunker/daisyui-components';
	import LucideBlocks from '~icons/lucide/blocks';
	import LucideGripVertical from '~icons/lucide/grip-vertical';
	import { getBlueprintEditorContext } from '$lib/components/pipeline/blueprintContext.js';
	import { getPipelineModuleNodeInfo } from '$lib/components/pipeline/pipelineModuleNodeRegistry.js';
	import { toHeaderCase } from 'js-convert-case';
	import { deconstructPipelineModuleIdentifier } from '@bytebunker/backend';
	import { asDroppable } from 'svelte-drag-and-drop-actions';
	import { groupByKey } from '@bytebunker/backend';

	let editorContext = $derived(getBlueprintEditorContext()());
	let pipelineModules = $derived(editorContext.pipelineModules);

	let groupedModules = $derived(
		pipelineModules
			? groupByKey(
					Object.values(pipelineModules)
						.map((m) => ({
							...m,
							extensionName: deconstructPipelineModuleIdentifier(m.id).extensionName
						}))
						.sort((a, b) => a.extensionName.localeCompare(b.extensionName)),
					'extensionName'
				)
			: {}
	);
</script>

<Card class="bg-base-100 border-base-300 rounded-box border shadow">
	<CardBody class="p-4">
		<div class="mb-4 flex items-center">
			<h2 class="flex items-center gap-2 font-bold">
				<LucideBlocks class="size-5" />
				Verfügbare Module
			</h2>
			<span class="pl-1 text-sm text-neutral-500">- Drag & Drop neue Module auf den Blueprint</span>
		</div>
		<div class="flex flex-wrap gap-3">
			{#each Object.entries(groupedModules) as [extensionName, modules] (extensionName)}
				<div class="bg-base-200/30 rounded-box p-2">
					<h3 class="mb-2 font-bold text-neutral-600">{toHeaderCase(extensionName)}</h3>
					<div class="flex flex-wrap gap-3">
						{#each modules as module (module.id)}
							{@const { extensionName, moduleName, moduleVersion } =
								deconstructPipelineModuleIdentifier(module.id)}
							{@const info = getPipelineModuleNodeInfo(module.id)}
							{@const Icon = info.icon}

							<div
								class="draggable-node rounded-box btn flex scale-95 cursor-grab items-center border border-dashed px-2 py-2 text-white opacity-90 transition-all hover:scale-100 hover:opacity-100 hover:brightness-100"
								style="--bg-color: {info.backgroundColor}; --fg-color: {info.color}"
								title={module.id}
								use:asDroppable={{
									Extras: { moduleId: module.id },
									Operations: 'move',
									DataToOffer: { 'item/pipeline-module': module.id }
								}}
							>
								<Icon class="mr-1 size-4" />
								<span class="mr-2 font-medium">{toHeaderCase(moduleName)}</span>
								<LucideGripVertical class="size-4" />
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="p-4">
					<span class="loading loading-ring text-primary loading-lg"></span>
				</div>
			{/each}
		</div>
	</CardBody>
</Card>

<style>
	.draggable-node {
		background: linear-gradient(200deg, rgba(255, 255, 255, 0.4), transparent 100%),
			linear-gradient(0deg, var(--bg-color), var(--bg-color));
		color: var(--fg-color);
		border-color: var(--fg-color);
	}
</style>

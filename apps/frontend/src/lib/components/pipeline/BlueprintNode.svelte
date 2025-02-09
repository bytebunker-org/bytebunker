<script lang="ts">
	import { useViewport } from '@xyflow/svelte';
	import {
		type BlueprintNodeProps,
		specialHandleNames
	} from '$lib/components/pipeline/blueprintUtil.js';
	import { getBlueprintEditorContext } from '$lib/components/pipeline/blueprintContext.js';
	import { deconstructPipelineModuleIdentifier } from '@bytebunker/backend';
	import { toHeaderCase } from 'js-convert-case';
	import BlueprintHandle from '$lib/components/pipeline/BlueprintHandle.svelte';
	import type { JsonSchemaDto } from '@bytebunker/backend';
	import type { JSONSchema7 } from 'json-schema';
	import { getPipelineModuleNodeInfo } from '$lib/components/pipeline/pipelineModuleNodeRegistry.js';
	import { Button } from '@bytebunker/daisyui-components';
	import LucidePencil from '~icons/lucide/pencil';

	let { data }: BlueprintNodeProps = $props();

	let moduleId = $derived(deconstructPipelineModuleIdentifier(data.moduleId));

	let editorContext = getBlueprintEditorContext()();
	let module = $derived(editorContext.pipelineModules[data.moduleId]);
	let maxHandleAmount = $derived(
		Math.max(
			Object.keys(module.inputTypeSchema?.jsonSchema?.properties ?? {}).length,
			Object.keys(module.outputTypeSchema?.jsonSchema?.properties ?? {}).length
		)
	);

	let blueprintNodeInfo = $derived(getPipelineModuleNodeInfo(data.moduleId));
	let Icon = $derived(blueprintNodeInfo.icon);

	function getHandles(schema: JsonSchemaDto | undefined): [string, JSONSchema7][] {
		if (!schema) {
			return [];
		}

		const entries = Object.entries(schema.jsonSchema?.properties ?? {}) as [string, JSONSchema7][];

		return entries.sort((a, b) => {
			const aIsSpecialHandle = Number(specialHandleNames.includes(a[0]));
			const bIsSpecialHandle = Number(specialHandleNames.includes(b[0]));

			return aIsSpecialHandle - bIsSpecialHandle || a[0].localeCompare(b[0]);
		});
	}

	const viewport = useViewport();

	let enlargedTitle = $derived(viewport.current.zoom < 0.6);
</script>

<div
	class="rounded-box bg-base-100 shadow-md"
	style="--header-height: 32px; --handle-height: 36px; --max-handle-amount: {maxHandleAmount}"
>
	<div
		class={[
			'fixed top-0 right-0 left-0 flex items-center justify-between gap-1 border-b border-neutral-300 p-2 text-center font-bold transition-all duration-100',
			enlargedTitle
				? 'rounded-box h-full flex-col items-center justify-center text-2xl text-wrap'
				: 'rounded-t-box h-[32px] justify-center'
		]}
		style="background: linear-gradient(200deg, rgba(255,255,255, 0.4), transparent 100%), linear-gradient(0deg, {blueprintNodeInfo.backgroundColor}, {blueprintNodeInfo.backgroundColor}); color: {blueprintNodeInfo.color}"
	>
		<Icon class="transition-all {enlargedTitle ? 'size-8 opacity-80' : ''}" />
		{toHeaderCase(moduleId.moduleName)}
		<Button on:click><LucidePencil /></Button>
	</div>
	<div class="h-[32px]"></div>
	<div class="node-handles flex flex-row justify-between gap-2">
		<div class="relative flex flex-col">
			{#each getHandles(module.inputTypeSchema) as [handleName, handleType], i (handleName)}
				<BlueprintHandle
					nodeData={data}
					type="input"
					name={handleName}
					schema={handleType}
					index={i}
					hideLabel={enlargedTitle}
				/>
			{/each}
		</div>
		<div class="relative flex flex-col">
			{#each getHandles(module.outputTypeSchema) as [handleName, handleType], i (handleName)}
				<BlueprintHandle
					nodeData={data}
					type="output"
					name={handleName}
					schema={handleType}
					index={i}
					hideLabel={enlargedTitle}
				/>
			{/each}
		</div>
	</div>
</div>

<style>
	.node-handles {
		height: calc(var(--handle-height) * var(--max-handle-amount));
	}
</style>

<script lang="ts">
	import type { ModalProps } from '$lib/components/modal/modalRegistry.js';
	import type { ModalTypeEnum } from '$lib/components/modal/modalTypeEnum.js';
	import { Dialog } from 'bits-ui';
	import { BlueprintNodeDto } from '@bytebunker/backend';
	import { deconstructPipelineModuleIdentifier } from '@bytebunker/backend';
	import { toHeaderCase } from 'js-convert-case';
	import CodeEditor from '$lib/components/monaco/CodeEditor.svelte';
	import { onMount } from 'svelte';
	import { Button } from '@bytebunker/daisyui-components';

	let { options, close }: ModalProps<ModalTypeEnum.EDIT_BLUEPRINT_NODE> = $props();

	let node = $derived<BlueprintNodeDto>(options.blueprintNode);
	let moduleId = $derived(deconstructPipelineModuleIdentifier(node.moduleId));

	let constantInputDataJson = $state('');

	onMount(() => {
		constantInputDataJson = JSON.stringify(options.blueprintNode.constantInputData, null, 4);
	});

	function save() {
		if (!isValid) {
			return;
		}

		const data = JSON.parse(JSON.stringify(node)) as BlueprintNodeDto;
		data.constantInputData = JSON.parse(constantInputDataJson) as Record<string, unknown>;

		close(data);
	}

	let isValid = $derived.by(() => {
		try {
			JSON.parse(constantInputDataJson);

			return true;
		} catch {
			return false;
		}
	});
</script>

<div class="flex flex-col gap-4 p-3">
	<Dialog.Title class=" text-lg font-semibold tracking-tight"
		>Edit {toHeaderCase(moduleId.moduleName)} Node
	</Dialog.Title>
	<label class="form-control flex w-full flex-col">
		<div class="label">
			<span class="label-text">Edit Constant Input Data</span>
		</div>
		<CodeEditor
			class="input h-[50vh] w-full !outline-transparent"
			bind:value={constantInputDataJson}
			language="json"
			jsonSchema={options.pipelineModule.inputTypeSchema?.jsonSchema}
		/>
		<!--<MonacoEditor
			code={JSON.stringify(node.constantInputData, null, 4)}
			language="json"
			jsonSchema={options.pipelineModule.inputTypeSchema?.jsonSchema}
		/>-->
	</label>
	<Button color="primary" onclick={save} disabled={!isValid}>Speichern</Button>
</div>

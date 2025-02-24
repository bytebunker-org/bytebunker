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
	import type { JSONSchema7 } from 'json-schema';
	import pipelineScriptTemplate from '$lib/components/monaco/typescriptContext/pipelineScript/pipelineScriptTemplate.js?raw';

	let { options, close }: ModalProps<ModalTypeEnum.EDIT_BLUEPRINT_NODE> = $props();

	let node = $derived<BlueprintNodeDto>(options.blueprintNode);
	let moduleId = $derived(deconstructPipelineModuleIdentifier(node.moduleId));

	let isExecuteCodeModule = $derived(moduleId.moduleName === 'execute-code');
	let constantInputDataJson = $state('');
	let executeCodeModuleScript = $state('');

	onMount(() => {
		const constantInputData = $state.snapshot(options.blueprintNode.constantInputData) ?? {};

		if (isExecuteCodeModule) {
			executeCodeModuleScript = constantInputData.code ?? pipelineScriptTemplate;
			delete constantInputData.code;
		}

		constantInputDataJson = JSON.stringify(constantInputData, null, 4);
	});

	function save() {
		if (!isValid) {
			return;
		}

		const data = JSON.parse(JSON.stringify(node)) as BlueprintNodeDto;
		data.constantInputData = {
			...(JSON.parse(constantInputDataJson) as Record<string, unknown>),
			...(isExecuteCodeModule ? { code: executeCodeModuleScript } : {})
		};

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

	function processJsonSchemaForEditor(
		jsonSchema: JSONSchema7 | undefined
	): JSONSchema7 | undefined {
		const hiddenProperties = ['dependentModules', 'success', 'code'];

		if (jsonSchema?.properties) {
			for (const [key, value] of Object.entries(jsonSchema.properties)) {
				if (hiddenProperties.includes(key)) {
					delete jsonSchema.properties[key];
				}
			}
		}

		return jsonSchema;
	}
</script>

<div class="flex flex-col gap-4 p-3">
	<Dialog.Title class=" text-lg font-semibold tracking-tight"
		>Edit {toHeaderCase(moduleId.moduleName)} Node
	</Dialog.Title>
	{#if isExecuteCodeModule}
		<label class="form-control flex w-full flex-col">
			<div class="label">
				<span class="label-text">Pipeline Script</span>
			</div>
			<CodeEditor
				class="input h-[50vh] w-full !outline-transparent"
				bind:value={executeCodeModuleScript}
				language="typescript"
			/>
		</label>
	{/if}
	<label class="form-control flex w-full flex-col">
		<div class="label">
			<span class="label-text">Edit Constant Input Data</span>
		</div>
		<CodeEditor
			class="input {isExecuteCodeModule ? 'h-[20vh]' : 'h-[40vh]'} w-full !outline-transparent"
			bind:value={constantInputDataJson}
			language="json"
			jsonSchema={processJsonSchemaForEditor(
				$state.snapshot(options.pipelineModule.inputTypeSchema?.jsonSchema)
			)}
		/>
	</label>
	<Button color="primary" onclick={save} disabled={!isValid}>Speichern</Button>
</div>

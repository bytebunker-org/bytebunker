<script lang="ts">
	import loader from '@monaco-editor/loader';
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
	import { onDestroy, onMount } from 'svelte';
	import type { JSONSchema7 } from 'json-schema';
	import type { HTMLAttributes } from 'svelte/elements';
	import pipelineScriptContext from '$lib/components/monaco/pipelineScriptContext.d.ts.txt?raw';
	import pipelineActivityStreamsContext from '$lib/components/monaco/pipelineActivityStreamsContext.d.ts.txt?raw';

	let editor: Monaco.editor.IStandaloneCodeEditor;
	let monaco: typeof Monaco;
	let editorContainer: HTMLElement;

	interface Props extends HTMLAttributes<HTMLDivElement> {
		value: string;

		language?: string;

		jsonSchema?: JSONSchema7;

		readOnly?: boolean;
	}

	let {
		value = $bindable(),
		language = 'json',
		jsonSchema,
		readOnly = false,
		...restProps
	}: Props = $props();

	onMount(() => {
		(async () => {
			// Remove the next two lines to load the monaco editor from a CDN
			// see https://www.npmjs.com/package/@monaco-editor/loader#config
			const monacoEditor = await import('monaco-editor');
			loader.config({
				monaco: monacoEditor.default
			});

			monaco = await loader.init();

			monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

			const fileExtension = language === 'typescript' ? 'ts' : language;

			let modelUri: Monaco.Uri; // a made up unique URI for our model

			if (language === 'typescript') {
				modelUri = monaco.Uri.parse(`ts:pipeline-temp/editor-file.ts`);
			} else {
				modelUri = monaco.Uri.parse(`a://pipeline-temp/editor-file.${fileExtension}`);
			}

			if (jsonSchema) {
				monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
					validate: !readOnly,
					schemaValidation: readOnly ? 'ignore' : 'warning',
					allowComments: false,
					trailingCommas: readOnly ? 'ignore' : 'error',
					comments: readOnly ? 'ignore' : 'error',
					schemas: [
						{
							uri: jsonSchema.$id ?? 'http://example.com/unknown-schema.json',
							fileMatch: [modelUri.toString()], // associate with our model
							schema: JSON.parse(JSON.stringify(jsonSchema))
						}
					]
				});
			}
			if (language === 'typescript') {
				monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
					target: monaco.languages.typescript.ScriptTarget.ES2020,
					allowNonTsExtensions: true,
					module: monaco.languages.typescript.ModuleKind.ESNext,
					moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
					noLib: true,
					strict: true
				});

				const libSource = [pipelineScriptContext, pipelineActivityStreamsContext].join('\n');
				const libUri = 'ts:pipeline-temp/pipelineScriptContext.d.ts';
				monaco.languages.typescript.javascriptDefaults.addExtraLib(libSource, libUri);
				monaco.editor.createModel(libSource, 'typescript', monaco.Uri.parse(libUri));
			}

			const model = monaco.editor.createModel(value, language, modelUri);
			const darkMode =
				window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

			editor = monaco.editor.create(editorContainer, {
				value,
				model,
				theme: darkMode ? 'vs-dark' : 'vs',
				automaticLayout: true,
				overviewRulerLanes: 0,
				overviewRulerBorder: false,
				wordWrap: 'on',
				readOnly
			});

			editor.onDidChangeModelContent((e) => {
				if (e.isFlush) {
					// true if setValue call
					//console.log('setValue call');
					/* editor.setValue(value); */
				} else {
					value = editor?.getValue() ?? ' ';
				}
			});
		})();
	});

	$effect(() => {
		if (value) {
			if (editor) {
				// check if the editor is focused
				if (editor.hasWidgetFocus()) {
					// let the user edit with no interference
				} else {
					if (editor?.getValue() ?? ' ' !== value) {
						editor?.setValue(value);
					}
				}
			}
		}
		if (value === '') {
			editor?.setValue(' ');
		}
	});

	onDestroy(() => {
		monaco?.editor.getModels().forEach((model) => model.dispose());
		editor?.dispose();
	});
</script>

<div {...restProps} bind:this={editorContainer}></div>

<style>
	.monaco-container {
		width: 100%;
		height: 600px;
		padding: 0;
		border-radius: 50px;
	}
</style>

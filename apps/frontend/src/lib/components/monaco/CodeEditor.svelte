<script lang="ts">
	import loader from '@monaco-editor/loader';
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
	import { onDestroy, onMount } from 'svelte';
	import type { JSONSchema7 } from 'json-schema';
	import type { HTMLAttributes } from 'svelte/elements';

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
			loader.config({ monaco: monacoEditor.default });

			monaco = await loader.init();

			monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

			const modelUri = monaco.Uri.parse(`a://example/editor-file.${language}`); // a made up unique URI for our model

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

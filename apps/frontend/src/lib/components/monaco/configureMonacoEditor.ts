import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { pipelineScriptContextSource } from '$lib/components/monaco/pipelineScriptContext.js';
import type { JSONSchema7 } from 'json-schema';

export function configureMonacoEditor({
	monaco,
	editorContainer,
	initialValue,
	language,
	jsonSchema,
	readOnly
}: {
	monaco: typeof Monaco;
	editorContainer: HTMLElement;
	initialValue: string;
	language: 'typescript' | 'json';
	jsonSchema?: JSONSchema7;
	readOnly?: boolean;
}) {
	monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

	const fileExtension = language === 'typescript' ? 'ts' : language;

	let modelUri: Monaco.Uri; // a made up unique URI for our model

	const darkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

	let model: Monaco.editor.ITextModel;

	if (language === 'typescript') {
		model = configureTypescript({ monaco, initialValue });
	} else if (language === 'json') {
		model = configureJson({ monaco, initialValue, jsonSchema, readOnly });
	} else {
		throw new Error(`Unsupported code editor language: ${language}`);
	}

	return monaco.editor.create(editorContainer, {
		value: initialValue,
		model,
		theme: darkMode ? 'vs-dark' : 'vs',
		automaticLayout: true,
		overviewRulerLanes: 0,
		overviewRulerBorder: false,
		wordWrap: 'on',
		readOnly
	});
}

function configureJson({
	monaco,
	initialValue,
	jsonSchema,
	readOnly
}: {
	monaco: typeof Monaco;
	initialValue: string;
	jsonSchema?: JSONSchema7;
	readOnly?: boolean;
}) {
	const modelUri = monaco.Uri.parse(`a://pipeline-temp/editor-file.json`);

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

	return monaco.editor.createModel(initialValue, 'json', modelUri);
}

function configureTypescript({
	monaco,
	initialValue
}: {
	monaco: typeof Monaco;
	initialValue: string;
}) {
	const modelUri = monaco.Uri.parse(`ts:pipeline-temp/editor-file.ts`);

	monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
		target: monaco.languages.typescript.ScriptTarget.ES2020,
		allowNonTsExtensions: true,
		module: monaco.languages.typescript.ModuleKind.ESNext,
		moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
		noLib: true,
		strict: true
	});

	const libUri = 'ts:pipeline-temp/pipelineScriptContext.d.ts';
	monaco.languages.typescript.javascriptDefaults.addExtraLib(pipelineScriptContextSource, libUri);
	monaco.editor.createModel(pipelineScriptContextSource, 'typescript', monaco.Uri.parse(libUri));

	return monaco.editor.createModel(initialValue, 'typescript', modelUri);
}

import type { PipelineModuleIdentifier, PipelineModuleDto } from '@bytebunker/backend';
import { getContext, setContext } from 'svelte';
import type { Blueprint } from '@bytebunker/backend';

export interface BlueprintEditorContext {
	blueprint: Blueprint;

	pipelineModules: Record<PipelineModuleIdentifier, PipelineModuleDto>;
}

export const BLUEPRINT_EDITOR_CONTEXT_KEY = 'BLUEPRINT_EDITOR_CONTEXT_KEY';
export const setBlueprintEditorContext = (editorContext: () => BlueprintEditorContext) =>
	setContext(BLUEPRINT_EDITOR_CONTEXT_KEY, editorContext);
export const getBlueprintEditorContext = () =>
	getContext<() => BlueprintEditorContext>(BLUEPRINT_EDITOR_CONTEXT_KEY);

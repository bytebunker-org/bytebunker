import type { PipelineModuleIdentifier, PipelineModuleDto } from '@bytebunker/backend';
import { getContext, setContext } from 'svelte';
import type {
	Blueprint,
	BlueprintDataDto,
	PipelineExecutionDto,
	NodeProgressDto,
	BlueprintValidationIssueDto
} from '@bytebunker/backend';

export interface BlueprintEditorContext {
	blueprint: Blueprint;

	pipelineModules: Record<PipelineModuleIdentifier, PipelineModuleDto>;

	pipelineExecution?: PipelineExecutionDto;

	allowEdit: boolean;

	/** Live progress per node id (execution view). Rendered by BlueprintNode. */
	nodeProgress?: Record<number, NodeProgressDto>;

	/** Validation issues per node id (editor). Rendered by BlueprintNode. */
	nodeIssues?: Record<number, BlueprintValidationIssueDto[]>;
}

export const BLUEPRINT_EDITOR_CONTEXT_KEY = 'BLUEPRINT_EDITOR_CONTEXT_KEY';
export const setBlueprintEditorContext = (editorContext: () => BlueprintEditorContext) =>
	setContext(BLUEPRINT_EDITOR_CONTEXT_KEY, editorContext);
export const getBlueprintEditorContext = () =>
	getContext<() => BlueprintEditorContext>(BLUEPRINT_EDITOR_CONTEXT_KEY);

export const BLUEPRINT_SERIALIZE_FUNCTION_CONTEXT_KEY = 'BLUEPRINT_SERIALIZE_FUNCTION_CONTEXT_KEY';
export const setBlueprintSerializeFunctionContext = (serializeFunctionStore: {
	current?: () => BlueprintDataDto;
}) => setContext(BLUEPRINT_SERIALIZE_FUNCTION_CONTEXT_KEY, serializeFunctionStore);
export const getBlueprintSerializeFunctionContext = () =>
	getContext<{ current?: () => BlueprintDataDto }>(BLUEPRINT_SERIALIZE_FUNCTION_CONTEXT_KEY);

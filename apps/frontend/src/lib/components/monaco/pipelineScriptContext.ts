import pipelineScriptContext from '$lib/components/monaco/typescriptContext/pipelineScript/pipelineScriptContext.d.ts?raw';
import pipelineActivityStreamsContext from '$lib/components/monaco/typescriptContext/pipelineScript/pipelineActivityStreamsContext.d.ts?raw';

export const pipelineScriptContextSource = [
	pipelineScriptContext,
	pipelineActivityStreamsContext
].join('\n');

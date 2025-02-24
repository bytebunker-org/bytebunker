import pipelineScriptContext from '$lib/components/monaco/typescriptContext/pipelineScript/pipelineScriptContext.d.ts?raw';
import pipelineActivityStreamsContext from '$lib/components/monaco/typescriptContext/pipelineScript/pipelineActivityStreamsContext.d.ts?raw';
import luxonUtilContext from '$lib/components/monaco/typescriptContext/pipelineScript/dateTime/_util.d.ts?raw';
import luxonDateTimeContext from '$lib/components/monaco/typescriptContext/pipelineScript/dateTime/datetime.d.ts?raw';
import luxonDurationContext from '$lib/components/monaco/typescriptContext/pipelineScript/dateTime/duration.d.ts?raw';
import luxonInfoContext from '$lib/components/monaco/typescriptContext/pipelineScript/dateTime/info.d.ts?raw';
import luxonIntervalContext from '$lib/components/monaco/typescriptContext/pipelineScript/dateTime/interval.d.ts?raw';
import luxonMiscContext from '$lib/components/monaco/typescriptContext/pipelineScript/dateTime/misc.d.ts?raw';
import luxonSettingsContext from '$lib/components/monaco/typescriptContext/pipelineScript/dateTime/settings.d.ts?raw';
import luxonZoneContext from '$lib/components/monaco/typescriptContext/pipelineScript/dateTime/zone.d.ts?raw';

export const pipelineScriptContextSource = [
	luxonUtilContext,
	luxonDateTimeContext,
	luxonDurationContext,
	luxonInfoContext,
	luxonIntervalContext,
	luxonMiscContext,
	luxonSettingsContext,
	luxonZoneContext,
	pipelineScriptContext,
	pipelineActivityStreamsContext
].join('\n');

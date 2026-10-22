import { getContext, setContext } from 'svelte';

/** Lets the page ask the flow to select and zoom to a node (the flow lives inside the SvelteFlowProvider). */
export interface BlueprintFocusStore {
	current?: (nodeId: number) => void;
}

const BLUEPRINT_FOCUS_CONTEXT_KEY = 'BLUEPRINT_FOCUS_CONTEXT_KEY';

export const setBlueprintFocusContext = (store: BlueprintFocusStore) =>
	setContext(BLUEPRINT_FOCUS_CONTEXT_KEY, store);

export const getBlueprintFocusContext = () =>
	getContext<BlueprintFocusStore | undefined>(BLUEPRINT_FOCUS_CONTEXT_KEY);

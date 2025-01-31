<script lang="ts">
    import { writable } from 'svelte/store';
    import { createEventDispatcher, setContext } from 'svelte';
    import TabHeader from '$lib/TabHeader.svelte';
    import { classnames } from '$lib/util.js';
    import type { TabContext } from '$lib/type/TabContext.js';

    const dispatch = createEventDispatcher();

    
    interface Props {
        class?: string;
        bordered?: boolean;
        lifted?: boolean;
        boxed?: boolean;
        size?: 'xs' | 'sm' | 'md' | 'lg';
        children?: import('svelte').Snippet;
    }

    let {
        class: className = '',
        bordered = false,
        lifted = false,
        boxed = false,
        size = 'md',
        children
    }: Props = $props();

    const activeTabId = writable<string | undefined>();
    setContext<TabContext>('tabs', {
        activeTabId,
        setActiveTab,
        tabStyle: {
            bordered,
            lifted,
            boxed,
            size
        }
    });

    export function setActiveTab(tabId: string) {
        activeTabId.set(tabId);
        dispatch('tab', tabId);
    }

    let classes = $derived(classnames(className, {
        'tabs-boxed': boxed
    }));
</script>

<div class={classes}>
    <TabHeader>
        {@render children?.()}
    </TabHeader>
    {@render children?.()}
</div>

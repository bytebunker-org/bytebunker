<script lang="ts">
    import { getContext } from 'svelte';
    import { classnames } from '$lib/util.js';
    import type { TabsContext } from '$lib/tabs/types.js';

    interface Props {
        value: string;
        tabHeaderClass?: string;
        class?: string;
        children?: import('svelte').Snippet;
    }

    let {
        value,
        tabHeaderClass = '',
        class: className = '',
        children
    }: Props = $props();
    

    const isTabHeader = getContext('tabHeader');
    const { selectedTab, tabStyle } = getContext<TabsContext>('tabs');

    let tabHeaderClasses = $derived(classnames('tab', tabHeaderClass, {
        'tab-active': $selectedTab === value,
        'tab-bordered': tabStyle?.bordered,
        'tab-lifted': tabStyle?.lifted
    }));
</script>

{#if isTabHeader}
    <button 
        class={tabHeaderClasses} 
        role="tab"
        aria-selected={$selectedTab === value}
        onclick={() => selectedTab.set(value)}
    >
        <div class="">
            {@render children?.()}
        </div>
    </button>
{:else}
    <div class={className}>
        {@render children?.()}
    </div>
{/if}

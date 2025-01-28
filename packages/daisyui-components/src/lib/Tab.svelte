<script lang="ts">
    import { getContext } from 'svelte';
    import { classnames } from '$lib/util.js';
    import type { TabsContext } from '$lib/tabs/types.js';

    export let value: string;
    export let tabHeaderClass = '';
    let className = '';
    export { className as class };

    const isTabHeader = getContext('tabHeader');
    const { selectedTab, tabStyle } = getContext<TabsContext>('tabs');

    $: tabHeaderClasses = classnames('tab', tabHeaderClass, {
        'tab-active': $selectedTab === value,
        'tab-bordered': tabStyle?.bordered,
        'tab-lifted': tabStyle?.lifted
    });
</script>

{#if isTabHeader}
    <button 
        class={tabHeaderClasses} 
        role="tab"
        aria-selected={$selectedTab === value}
        on:click={() => selectedTab.set(value)}
    >
        <div class="">
            <slot />
        </div>
    </button>
{:else}
    <div class={className}>
        <slot />
    </div>
{/if}

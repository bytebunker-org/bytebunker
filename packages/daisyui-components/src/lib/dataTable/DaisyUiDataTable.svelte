<script lang="ts">
    import { setContext } from 'svelte';
    import type { Readable } from 'svelte/store';
    import { fade } from 'svelte/transition';
    import DataRow from './DaisyUiDataRow.svelte';
    import DataTablePagination from './DaisyUiDataTablePagination.svelte';
    import SearchField from './DaisyUiSearchField.svelte';
    import type { DataTableConfig, MessageFormatter } from 'svelte-advanced-datatable';
    import {
        createMessageFormatter,
        DATATABLE_CONFIG,
        DATATABLE_MESSAGE_FORMATTER,
        mergeDataTableConfigDefaults
    } from 'svelte-advanced-datatable';
    import type { FullDataTableConfig } from 'svelte-advanced-datatable';
    import type { ParsedSearchQuery } from 'svelte-advanced-datatable/searchParser';
    import { InternalDataTable } from 'svelte-advanced-datatable/internal';
    import { clamp } from '$lib/util.js';
    import SortUpIcon from '$lib/dataTable/icons/SortUpIcon.svelte';
    import SortDownIcon from '$lib/dataTable/icons/SortDownIcon.svelte';
    import SortIcon from '$lib/dataTable/icons/SortIcon.svelte';

    let configExport: DataTableConfig<unknown>;
    export { configExport as config };

    const config: FullDataTableConfig<unknown> = mergeDataTableConfigDefaults<unknown>(configExport);
    setContext(DATATABLE_CONFIG, config);
    const format: Readable<MessageFormatter> = createMessageFormatter<unknown>(config);
    setContext(DATATABLE_MESSAGE_FORMATTER, format);

    export let striped = false;
    export let compact = false;
    export let hoverable = true;

    let currentPage = 1;
    let searchInput = '';
    let searchQuery: ParsedSearchQuery | undefined;
</script>

<InternalDataTable
    let:queryObserver
    let:columnProperties
    let:itemAmount
    let:pageAmount
    let:items
    let:sortDirection
    let:toggleSorting
    let:sortColumnKey
    let:currentOpenIndex
    let:open
    let:highlightedItemId
    {searchInput}
    {searchQuery}
    {currentPage}
>
    <div class="mb-3 flex w-full flex-wrap items-center justify-between gap-3">
        <div class="flex flex-row items-center gap-3">
            <slot name="header-first" />
            {#if config.enableSearch}
                <SearchField bind:searchInput bind:searchQuery />
            {/if}
            <slot name="header-after-search" />
            <slot name="header-middle" />
        </div>
        <div class="flex flex-row items-center justify-end gap-3">
            {#if queryObserver.isLoading}
                <div in:fade|local={{ duration: 100 }} out:fade|local={{ duration: 300 }}>
                    <span class="loading loading-spinner"></span>
                </div>
            {/if}
            {#if config.enablePagination && config.showTopPagination}
                {#if itemAmount >= 0}
                    {@const startItemIndex = (currentPage - 1) * config.itemsPerPage + 1}
                    {@const endItemIndex = clamp(currentPage * config.itemsPerPage, config.itemsPerPage, itemAmount)}

                    <span class="text-base-content/80 whitespace-nowrap"
                        >{startItemIndex}
                        - {endItemIndex}
                        von {itemAmount}</span
                    >
                {:else}
                    <span class="text-base-content/80 whitespace-nowrap">0 - 0 von {Math.max(0, itemAmount)}</span>
                {/if}
                <DataTablePagination bind:currentPage {pageAmount} />
            {/if}
        </div>
    </div>

    <div class="table-container">
        <table class="table-sm table w-full" class:table-zebra={striped} class:table-hover={hoverable}>
            {#if config.showTableHeader}
                <thead>
                    <tr>
                        {#each Object.entries(columnProperties) as [key, colProp], i}
                            {#if !colProp.hidden}
                                <th
                                    class="whitespace-normal"
                                    class:w-12={key === 'actions'}
                                    on:click={() => colProp.sortable && toggleSorting(key)}
                                >
                                    <div class="flex flex-row items-center">
                                        <span class="mr-2">
                                            {$format(`dataTable.${config.type}.${key}.label`)}
                                        </span>
                                        {#if colProp.sortable && items.length > 1}
                                            {#if sortColumnKey === key && sortDirection === 'asc'}
                                                <SortUpIcon />
                                            {:else if sortColumnKey === key && sortDirection === 'desc'}
                                                <SortDownIcon />
                                            {:else}
                                                <SortIcon />
                                            {/if}
                                        {/if}
                                    </div>
                                </th>
                            {/if}
                        {/each}
                    </tr>
                </thead>
            {/if}
            <tbody>
                {#each items as item, index (item[config.dataUniquePropertyKey])}
                    <DataRow
                        {item}
                        {index}
                        {config}
                        openIndex={currentOpenIndex}
                        {open}
                        onClick={config.onItemClick}
                        highlighted={highlightedItemId === item[config.dataUniquePropertyKey]}
                    />
                {/each}
            </tbody>
        </table>
    </div>
    {#if items.length > 10 && config.enablePagination && config.showBottomPagination}
        <div class="flex flex-wrap items-center justify-between" transition:fade|local={{ duration: 200 }}>
            <div>
                {#if queryObserver.isLoading}
                    <span class="loading loading-spinner"></span>
                {/if}
            </div>
            <div class="flex flex-row items-baseline">
                {#if itemAmount >= 0}
                    <span class="text-base-content/80 mr-3 whitespace-nowrap"
                        >{(currentPage - 1) * config.itemsPerPage + 1}
                        - {clamp(currentPage * config.itemsPerPage, config.itemsPerPage, itemAmount)} von {itemAmount}</span
                    >
                {/if}
                <DataTablePagination bind:currentPage {pageAmount} />
            </div>
        </div>
    {/if}
</InternalDataTable>

<style>
    .table-container {
        width: 100%;
    }

    :global(.table-container td) {
        max-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    :global(.table-container td:last-child) {
        width: 3rem !important;
        padding: 0 !important;
        text-align: center;
    }
</style>

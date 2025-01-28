<script lang="ts">
    import { getContext } from 'svelte';
    import type { Readable } from 'svelte/store';
    import type { MessageFormatter } from 'svelte-advanced-datatable';
    import { DATATABLE_MESSAGE_FORMATTER } from 'svelte-advanced-datatable';
    import type { ParsedSearchQuery } from 'svelte-advanced-datatable/searchParser';
    import { InternalSearchField } from 'svelte-advanced-datatable/internal';
    import Input from '$lib/Input.svelte';

    const format: Readable<MessageFormatter> = getContext(DATATABLE_MESSAGE_FORMATTER);

    export let searchInput = '';
    export let searchQuery: ParsedSearchQuery | undefined = undefined;
    let inputElement: HTMLInputElement;
</script>

<InternalSearchField {inputElement} bind:searchQuery {searchInput}>
    <div class="mr-2">
        <Input
            aria-label={$format(`search.ariaLabel`)}
            bind:inner={inputElement}
            bind:value={searchInput}
            class="search-box"
            placeholder={$format(`search.placeholder`)}
            type="search"
            inputStyle="bordered"
        />
    </div>
</InternalSearchField>

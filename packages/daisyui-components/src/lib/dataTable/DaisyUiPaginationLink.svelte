<script lang="ts">
    import { getContext } from 'svelte';
    import type { Readable } from 'svelte/store';
    import type { MessageFormatter } from 'svelte-advanced-datatable';
    import { DATATABLE_MESSAGE_FORMATTER } from 'svelte-advanced-datatable';
    import { preventEvent } from '$lib/util.js';

    const format: Readable<MessageFormatter> = getContext(DATATABLE_MESSAGE_FORMATTER);

    let className = '';
    export { className as class };
    export let next = false;
    export let previous = false;
    export let first = false;
    export let last = false;
    export let href = '';

    $: classes = `${className} page-link`;

    let type: 'previous' | 'next' | 'first' | 'last';
    let caretCharacter: string;

    $: if (previous) {
        type = 'previous';
        caretCharacter = '\u2039';
    } else if (next) {
        type = 'next';
        caretCharacter = '\u203A';
    } else if (first) {
        type = 'first';
        caretCharacter = '\u00ab';
    } else if (last) {
        type = 'last';
        caretCharacter = '\u00bb';
    }
</script>

<a {...$$restProps} class={classes} {href} on:click on:dragstart={preventEvent}>
    {#if previous || first}
        <span aria-hidden="true"><slot>{caretCharacter}</slot></span><span class="d-none d-xl-inline sr-only"
            >&nbsp;{$format(`pagination.${type}`)}</span
        >
    {:else if next || last}
        <span class="d-none d-xl-inline sr-only">{$format(`pagination.${type}`)}&nbsp;</span><span aria-hidden="true"
            ><slot>{caretCharacter}</slot></span
        >
    {:else}
        <slot />
    {/if}
</a>

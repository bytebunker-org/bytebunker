<script lang="ts">
    import type { WrappedComponentColor, WrappedIconName } from 'svelte-advanced-datatable';
    import { classnames } from '$lib/util.js';
    import CheckIcon from '$lib/dataTable/icons/CheckIcon.svelte';
    import XIcon from '$lib/dataTable/icons/XIcon.svelte';

    export let name: WrappedIconName;
    export let color: WrappedComponentColor;

    $: classes = classnames({
        'text-error': color === 'red',
        'text-success': color === 'green',
        'text-info': color === 'blue'
        // Color neutral (without color) => gray
    });
</script>

{#if name === 'check'}
    <CheckIcon class={classes} />
{:else}
    <XIcon class={classes} />
{/if}

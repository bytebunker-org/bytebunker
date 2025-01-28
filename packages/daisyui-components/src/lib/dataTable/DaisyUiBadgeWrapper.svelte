<script lang="ts">
    import type { WrappedComponentColor } from 'svelte-advanced-datatable';
    import { classnames } from '$lib/util.js';

    export let color: WrappedComponentColor;

    $: classes = classnames('badge', {
        'badge-error': color === 'red',
        'badge-success': color === 'green',
        'badge-info': color === 'blue',
        'badge-warning': color === 'yellow',
        // Badge neutral (without color) => gray
        'badge-neutral': color === 'gray',
        'badge-ghost': color === 'dark' || color === 'light'
    });
</script>

<div class={classes}>
    <slot />
</div>

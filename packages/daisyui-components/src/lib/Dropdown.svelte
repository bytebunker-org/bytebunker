<script lang="ts">
    import { classnames } from '$lib/util.js';

    export let hover = false;

    export let opened = false;

    export let label = '';

    let className = '';
    export { className as class };
    $: classes = classnames(className, 'dropdown', {
        'dropdown-hover': hover,
        'dropdown-open': opened
    });
</script>

<div {...$$restProps} class={classes}>
    {#if $$slots.trigger}
        <slot name="trigger" />
    {:else}
        <label tabindex="0" class="btn m-1">{label}</label>
    {/if}
    <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box w-52 p-2 shadow">
        <slot />
    </ul>
</div>

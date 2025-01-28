<script lang="ts">
    import { classnames } from '$lib/util.js';

    export let label = '';
    export let labelInline = false;
    let forId: string | undefined = undefined;
    export { forId as for };

    let className = '';
    export { className as class };
    $: classes = classnames(className, 'form-control', {
        'flex flex-row items-center': labelInline
    });
    $: labelClasses = classnames('label', {
        'cursor-pointer': !!forId
    });
</script>

<div {...$$restProps} class={classes}>
    {#if label && !labelInline}
        <label class={labelClasses} for={forId}>
            <span class="label-text">{label}</span>
        </label>
    {/if}
    <slot />
    {#if label && labelInline}
        <label class={labelClasses} for={forId}>
            <span class="label-text">{label}</span>
        </label>
    {/if}
</div>

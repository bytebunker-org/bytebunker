<script lang="ts">
    import { classnames } from '$lib/util.js';

    

    interface Props {
        label?: string;
        labelInline?: boolean;
        for?: string | undefined;
        class?: string;
        children?: import('svelte').Snippet;
        [key: string]: any
    }

    let {
        label = '',
        labelInline = false,
        for: forId = undefined,
        class: className = '',
        children,
        ...rest
    }: Props = $props();
    
    let classes = $derived(classnames(className, 'form-control', {
        'flex flex-row items-center': labelInline
    }));
    let labelClasses = $derived(classnames('label', {
        'cursor-pointer': !!forId
    }));
</script>

<div {...rest} class={classes}>
    {#if label && !labelInline}
        <label class={labelClasses} for={forId}>
            <span class="label-text">{label}</span>
        </label>
    {/if}
    {@render children?.()}
    {#if label && labelInline}
        <label class={labelClasses} for={forId}>
            <span class="label-text">{label}</span>
        </label>
    {/if}
</div>

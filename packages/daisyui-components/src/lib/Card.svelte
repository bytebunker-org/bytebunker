<script lang="ts">
    import { classnames } from '$lib/util.js';


    interface Props {
        bordered?: boolean;
        imageFull?: boolean;
        normalPadding?: boolean;
        compact?: boolean;
        imageOnSide?: boolean;
        glass?: boolean;
        class?: string;
        children?: import('svelte').Snippet;
        [key: string]: any
    }

    let {
        bordered = false,
        imageFull = false,
        normalPadding = false,
        compact = false,
        imageOnSide = false,
        glass = false,
        class: className = '',
        children,
        ...rest
    }: Props = $props();
    
    let classes = $derived(classnames(className, 'card', {
        'card-bordered': bordered,
        'image-full': imageFull,
        'card-normal': normalPadding,
        'card-compact': compact,
        'card-side': imageOnSide,
        glass
    }));
</script>

<div {...rest} class={classes}>
    {@render children?.()}
</div>

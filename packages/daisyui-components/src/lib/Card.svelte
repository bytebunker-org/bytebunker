<script lang="ts">
    import { classnames } from '$lib/util.js';

    export let bordered = false;
    export let imageFull = false;
    export let normalPadding = false;
    export let compact = false;
    export let imageOnSide = false;
    export let glass = false;

    let className = '';
    export { className as class };
    $: classes = classnames(className, 'card', {
        'card-bordered': bordered,
        'image-full': imageFull,
        'card-normal': normalPadding,
        'card-compact': compact,
        'card-side': imageOnSide,
        glass
    });
</script>

<div {...$$restProps} class={classes}>
    <slot />
</div>

<script lang="ts">
    import { classnames } from '$lib/util.js';

    let className = '';
    export { className as class };
    $: classes = classnames(className, 'card-actions');
</script>

<div {...$$restProps} class={classes}>
    <slot />
</div>

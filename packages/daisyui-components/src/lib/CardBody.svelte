<script lang="ts">
    import { classnames } from '$lib/util.js';

    let className = '';
    export { className as class };
    $: classes = classnames(className, 'card-body');
</script>

<div {...$$restProps} class={classes}>
    <slot />
</div>

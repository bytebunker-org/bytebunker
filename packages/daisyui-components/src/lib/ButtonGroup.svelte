<script lang="ts">
    import { classnames } from '$lib/util.js';
    import { setJoinGroupContext } from '$lib/context.js';

    let className = '';
    export { className as class };
    export let vertical = false;

    $: classes = classnames('join', className, {
        'join-vertical': vertical
    });

    setJoinGroupContext(true);
</script>

<div class={classes}>
    <slot />
</div>

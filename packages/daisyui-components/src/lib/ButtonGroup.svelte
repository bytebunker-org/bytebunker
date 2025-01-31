<script lang="ts">
    import { classnames } from '$lib/util.js';
    import { setJoinGroupContext } from '$lib/context.js';

    
    interface Props {
        class?: string;
        vertical?: boolean;
        children?: import('svelte').Snippet;
    }

    let { class: className = '', vertical = false, children }: Props = $props();

    let classes = $derived(classnames('join', className, {
        'join-vertical': vertical
    }));

    setJoinGroupContext(true);
</script>

<div class={classes}>
    {@render children?.()}
</div>

<script lang="ts">
    import { classnames } from '$lib/util.js';

    interface Props {
        class?: string;
        children?: import('svelte').Snippet;
        [key: string]: any
    }

    let { class: className = '', children, ...rest }: Props = $props();
    
    let classes = $derived(classnames(className, 'card-body'));
</script>

<div {...rest} class={classes}>
    {@render children?.()}
</div>

<script lang="ts">
    import { onMount } from 'svelte';
    interface Props {
        children?: import('svelte').Snippet;
        [key: string]: any
    }

    let { children, ...rest }: Props = $props();

    let ref: HTMLDivElement = $state();
    let portal: HTMLDivElement;

    onMount(() => {
        portal = document.createElement('div');
        document.body.appendChild(portal);
        portal.appendChild(ref);

        return () => typeof document !== 'undefined' && document.body.removeChild(portal);
    });
</script>

<div bind:this={ref} {...rest}>
    {@render children?.()}
</div>

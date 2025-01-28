<script lang="ts">
    import { onMount } from 'svelte';

    let ref: HTMLDivElement;
    let portal: HTMLDivElement;

    onMount(() => {
        portal = document.createElement('div');
        document.body.appendChild(portal);
        portal.appendChild(ref);

        return () => typeof document !== 'undefined' && document.body.removeChild(portal);
    });
</script>

<div bind:this={ref} {...$$restProps}>
    <slot />
</div>

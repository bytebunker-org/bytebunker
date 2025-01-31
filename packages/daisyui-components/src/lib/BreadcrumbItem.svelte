<script lang="ts">
    interface Props {
        href?: string | undefined;
        children?: import('svelte').Snippet;
    }

    let { href = undefined, children }: Props = $props();
</script>

<li>
    {#if href}
        <a {href} class="hover:!no-underline">
            {@render children?.()}
        </a>
    {:else}
        {@render children?.()}
    {/if}
</li>

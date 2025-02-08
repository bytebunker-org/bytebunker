<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { ClassValue } from 'svelte/elements';

    interface Props {
        href?: string;

        class?: ClassValue;

        linkClass?: ClassValue;

        children: Snippet;
    }

    let { href, class: className, linkClass, children }: Props = $props();
</script>

<li class={className}>
    {#if href}
        <a {href} class={linkClass}>
            {@render children()}
        </a>
    {:else}
        {@render children()}
    {/if}
</li>

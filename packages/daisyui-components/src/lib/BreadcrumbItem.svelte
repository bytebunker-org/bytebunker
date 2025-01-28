<script lang="ts">
    export let href: string | undefined = undefined;
</script>

<li>
    {#if href}
        <a {href} class="hover:!no-underline">
            <slot />
        </a>
    {:else}
        <slot />
    {/if}
</li>

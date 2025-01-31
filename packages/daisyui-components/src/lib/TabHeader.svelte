<script lang="ts">
    import { setContext } from 'svelte';
    interface Props {
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();

    setContext('tabHeader', true);
</script>

<div class="tabs">
    {@render children?.()}
</div>

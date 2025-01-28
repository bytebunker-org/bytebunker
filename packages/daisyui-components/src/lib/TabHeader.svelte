<script lang="ts">
    import { setContext } from 'svelte';

    setContext('tabHeader', true);
</script>

<div class="tabs">
    <slot />
</div>

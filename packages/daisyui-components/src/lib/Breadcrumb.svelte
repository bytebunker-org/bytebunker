<script lang="ts">
    interface Props {
        class: string;
        children?: import('svelte').Snippet;
    }

    let { class: className, children }: Props = $props();
    
</script>

<div class="text-sm breadcrumbs {className}">
    <ul>
        {@render children?.()}
    </ul>
</div>

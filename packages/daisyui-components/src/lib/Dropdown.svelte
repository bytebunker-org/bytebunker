<script lang="ts">
    import { classnames } from '$lib/util.js';




    interface Props {
        hover?: boolean;
        opened?: boolean;
        label?: string;
        class?: string;
        trigger?: import('svelte').Snippet;
        children?: import('svelte').Snippet;
        [key: string]: any
    }

    let {
        hover = false,
        opened = false,
        label = '',
        class: className = '',
        trigger,
        children,
        ...rest
    }: Props = $props();
    
    let classes = $derived(classnames(className, 'dropdown', {
        'dropdown-hover': hover,
        'dropdown-open': opened
    }));
</script>

<div {...rest} class={classes}>
    {#if trigger}
        {@render trigger?.()}
    {:else}
        <label tabindex="0" class="btn m-1">{label}</label>
    {/if}
    <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box w-52 p-2 shadow">
        {@render children?.()}
    </ul>
</div>

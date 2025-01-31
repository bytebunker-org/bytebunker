<script lang="ts">
    import type { Snippet } from 'svelte/src';
    import type { ClassValue } from 'svelte/elements';

    interface Props {
        class?: ClassValue;
        color?: 'info' | 'success' | 'warning' | 'error';
        children: Snippet;
    }

    let { class: className = '', color = 'info', children }: Props = $props();

    /*
    {color === 'info' ? 'alert-info' : ''} {color === 'success' ? 'alert-success' : ''} {color === 'warning' ? 'alert-warning' : ''} {color === 'error' ? 'alert-error' : ''} {className}
     */
</script>

<div
    class={['alert', {
        "alert-info": color==="info",
    }, className]}
>
    {@render children?.()}
</div> 
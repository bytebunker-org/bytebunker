<script lang="ts">
    import type { ThemeColor } from '$lib/daisyUiComponents/type/Theme';
    import type { Snippet } from 'svelte';

    interface Props {
        title: string | Snippet;
        class?: string;
        color?: ThemeColor;
        titleClass?: string;
        titleOpenClass?: string;
        contentClass?: string;
        contentOpenClass?: string;
        openClass?: string;
        isOpen?: boolean;
        children: Snippet;
    }

    let {
        title,
        class: className = '',
        color = 'primary',
        titleClass = '',
        titleOpenClass = '',
        contentClass = '',
        contentOpenClass = '',
        openClass = '',
        isOpen = false,
        children
    }: Props = $props();
</script>

<div
    class={[
        'collapse-arrow collapse rounded border',
        className,
        {
            ['collapse-open ' + openClass]: isOpen,
            'collapse-close': !isOpen,
            'bg-primary text-primary-content border-primary': color === 'primary',
            'bg-secondary text-secondary-content border-secondary': color === 'secondary',
            'bg-accent text-accent-content border-accent': color === 'accent',
            'bg-info text-info-content border-info': color === 'info',
            'bg-success text-success-content border-success': color === 'success',
            'bg-warning text-warning-content border-warning': color === 'warning',
            'bg-error text-error-content border-error': color === 'error'
        }
    ]}
>
    <div
        class={[
            'collapse-title cursor-pointer',
            titleClass,
            {
                [titleOpenClass]: isOpen
            }
        ]}
        onclick={() => (isOpen = !isOpen)}
    >
        {#if typeof title === 'string'}
            {title}
        {:else}
            {@render title()}
        {/if}
    </div>
    <div
        class={[
            'collapse-content',
            contentClass,
            {
                [contentOpenClass]: isOpen
            }
        ]}
    >
        {#if isOpen}
            {@render children()}
        {/if}
    </div>
</div>
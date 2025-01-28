<script lang="ts">
    import { classnames } from '$lib/util.js';
    import type { ThemeColor } from '$lib/type/Theme.js';

    export let title = '';
    let className = '';
    export { className as class };
    export let color: ThemeColor | '' = 'primary';
    export let titleClass = '';
    export let titleOpenClass = '';
    export let contentClass = '';
    export let contentOpenClass = '';
    export let openClasses = '';
    let isOpen = false;
    $: classes = classnames('collapse collapse-arrow border rounded', className, {
        ['collapse-open ' + openClasses]: isOpen,
        'collapse-close': !isOpen,
        'bg-primary text-primary-content border-primary': color === 'primary',
        'bg-secondary text-secondary-content border-secondary': color === 'secondary',
        'bg-accent text-accent-content border-accent': color === 'accent',
        'bg-info text-info-content border-info': color === 'info',
        'bg-success text-success-content border-success': color === 'success',
        'bg-warning text-warning-content border-warning': color === 'warning',
        'bg-error text-error-content border-error': color === 'error'
    });
    $: titleClasses = classnames('collapse-title cursor-pointer', titleClass, {
        [titleOpenClass]: isOpen
    });
    $: contentClasses = classnames('collapse-content', contentClass, {
        [contentOpenClass]: isOpen
    });
</script>

<div class={classes}>
    <div class={titleClasses} on:click={() => (isOpen = !isOpen)}>
        <slot name="title">
            {title}
        </slot>
    </div>
    <div class={contentClasses}>
        {#if isOpen}
            <slot />
        {/if}
    </div>
</div>

<!-- @migration-task Error while migrating Svelte code: $$props is used together with named props in a way that cannot be automatically migrated. -->
<script lang="ts">
    import type { ThemeButtonStyle, ThemeColor, ThemeSize } from '$lib/type/Theme.js';
    import { classnames } from '$lib/util.js';
    import { getJoinGroupContext } from '$lib/context.js';

    let className = '';
    export { className as class };
    export let active = false;
    export let btnStyle: ThemeButtonStyle | undefined = undefined;
    export let size: ThemeSize | undefined = undefined;
    export let block = false;
    export let wide = false;
    export let loading = false;
    export let hideContentWhileLoading = false;
    export let color: ThemeColor = 'secondary';
    export let submit = false;
    export let disabled = false;
    export let href = '';
    export let element = undefined;

    const isJoinGroup = getJoinGroupContext();

    $: ariaLabel = $$props['aria-label'];

    $: ignoreColors = btnStyle === 'link';
    $: classes = classnames(className, 'btn', {
        'btn-active': active,
        // Styles
        'btn-ghost': btnStyle === 'ghost',
        'btn-link': btnStyle === 'link',
        'btn-outline': btnStyle === 'outline',
        'btn-square': btnStyle === 'square',
        'btn-circle': btnStyle === 'circle',
        // Colors
        'btn-primary': color === 'primary' && !ignoreColors,
        'btn-secondary': color === 'secondary' && !ignoreColors,
        'btn-accent': color === 'accent' && !ignoreColors,
        'btn-info': color === 'info' && !ignoreColors,
        'btn-success': color === 'success' && !ignoreColors,
        'btn-warning': color === 'warning' && !ignoreColors,
        'btn-error': color === 'error' && !ignoreColors,
        // Sizes
        'btn-xs': size === 'xs',
        'btn-sm': size === 'sm',
        'btn-lg': size === 'lg',
        'btn-wide': wide,
        'btn-block': block,
        'join-item': isJoinGroup
    });
</script>

{#if href}
    <a
        {...$$restProps}
        class={classes}
        disabled={disabled || loading ? true : undefined}
        bind:this={element}
        on:click
        on:mousedown
        {href}
        aria-label={ariaLabel}
    >
        {#if loading}
            <span class="loading loading-spinner"></span>
        {/if}
        {#if !(loading && hideContentWhileLoading)}
            <slot />
        {/if}
    </a>
{:else}
    <button
        {...$$restProps}
        type={submit ? 'submit' : 'button'}
        class={classes}
        disabled={disabled || loading ? true : undefined}
        bind:this={element}
        on:click
        on:mousedown
        aria-label={ariaLabel}
    >
        {#if loading}
            <span class="loading loading-spinner"></span>
        {/if}
        {#if !(loading && hideContentWhileLoading)}
            <slot />
        {/if}
    </button>
{/if}

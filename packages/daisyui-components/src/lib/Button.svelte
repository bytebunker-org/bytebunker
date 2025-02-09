<script lang="ts">
    import type { ThemeButtonStyle, ThemeColor, ThemeSize } from '$lib/type/Theme.js';
    import { classnames } from '$lib/util.js';
    import { getJoinGroupContext } from '$lib/context.js';
    import type { ClassValue, HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
    import type { Snippet } from 'svelte';


    interface Props extends HTMLButtonAttributes, HTMLAnchorAttributes {
        class?: ClassValue;
        active?: boolean;
        btnStyle?: ThemeButtonStyle | undefined;
        size?: ThemeSize | undefined;
        block?: boolean;
        wide?: boolean;
        loading?: boolean;
        hideContentWhileLoading?: boolean;
        color?: ThemeColor;
        submit?: boolean;
        disabled?: boolean;
        href?: string;
        element?: HTMLButtonElement | HTMLAnchorElement;
        children: Snippet;
    }

    let {
        class: className = '',
        active = false,
        btnStyle = undefined,
        size = undefined,
        block = false,
        wide = false,
        loading = false,
        hideContentWhileLoading = false,
        color = 'secondary',
        submit = false,
        disabled = false,
        href = '',
        element = $bindable(undefined),
        children,
        ...restProps
    }: Props = $props();

    const isJoinGroup = getJoinGroupContext();

    let ignoreColors = $derived(btnStyle === 'link');
    let classes = $derived(classnames(className, 'btn', {
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
    }));
</script>

{#if href}
    <a
        class={classes}
        disabled={disabled || loading ? true : undefined}
        bind:this={element}
        {href}
        {...restProps}
    >
        {#if loading}
            <span class="loading loading-spinner"></span>
        {/if}
        {#if !(loading && hideContentWhileLoading)}
            {@render children()}
        {/if}
    </a>
{:else}
    <button
        type={submit ? 'submit' : 'button'}
        class={classes}
        disabled={disabled || loading ? true : undefined}
        bind:this={element}
        {...restProps}
    >
        {#if loading}
            <span class="loading loading-spinner"></span>
        {/if}
        {#if !(loading && hideContentWhileLoading)}
            {@render children()}
        {/if}
    </button>
{/if}

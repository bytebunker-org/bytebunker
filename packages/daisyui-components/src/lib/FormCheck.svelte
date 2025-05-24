<script lang="ts">
    import { createBubbler } from 'svelte/legacy';

    const bubble = createBubbler();
    import type { ThemeColor, ThemeSize } from '$lib/type/Theme.js';
    import { classnames } from '$lib/util.js';

    

    interface Props {
        class?: string;
        element?: HTMLInputElement | undefined;
        checked?: boolean;
        disabled?: boolean;
        id?: string | undefined;
        label?: string;
        name?: string;
        size?: ThemeSize;
        color?: ThemeColor | '';
        type?: any;
        value?: any;
        [key: string]: any
    }

    let {
        class: className = '',
        element = $bindable(undefined),
        checked = $bindable(false),
        disabled = false,
        id = undefined,
        label = '',
        name = '',
        size = 'md',
        color = '',
        type = 'checkbox' as const,
        value = undefined,
        ...rest
    }: Props = $props();

    let classes = $derived(classnames(className, type, {
        'checkbox-primary': type === 'checkbox' && color === 'primary',
        'checkbox-secondary': type === 'checkbox' && color === 'secondary',
        'checkbox-accent': type === 'checkbox' && color === 'accent',
        'checkbox-success': type === 'checkbox' && color === 'success',
        'checkbox-warning': type === 'checkbox' && color === 'warning',
        'checkbox-info': type === 'checkbox' && color === 'info',
        'checkbox-error': type === 'checkbox' && color === 'error',
        'checkbox-xs': type === 'checkbox' && size === 'xs',
        'checkbox-sm': type === 'checkbox' && size === 'sm',
        'checkbox-md': type === 'checkbox' && size === 'md',
        'checkbox-lg': type === 'checkbox' && size === 'lg'
    }));
    let idFor = $derived(id || label);
</script>

<!--{#if type === 'radio'}
    <input
      {...$$restProps}
      class={inputClasses}
      id={idFor}
      type="radio"
      on:blur
      on:change
      on:focus
      on:input
      bind:group
      bind:this={inner}
      disabled={disabled ? true : undefined}
      {name}
      {value}
    />
{:else if type === 'switch'}
    <input
      {...$$restProps}
      class={inputClasses}
      id={idFor}
      type="checkbox"
      on:blur
      on:change
      on:focus
      on:input
      bind:checked
      bind:this={inner}
      disabled={disabled ? true : undefined}
      {name}
      {value}
    />
{:else}-->
{#if !!label}
    <label class="label cursor-pointer">
        <span class="label-text">{label}</span>
        <input
            {...rest}
            class={classes}
            id={idFor}
            type="checkbox"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            bind:checked
            bind:this={element}
            disabled={disabled ? true : undefined}
            {name}
            {value}
        />
    </label>
{:else}
    <input
        {...rest}
        class={classes}
        id={idFor}
        type="checkbox"
        onblur={bubble('blur')}
        onchange={bubble('change')}
        onfocus={bubble('focus')}
        oninput={bubble('input')}
        bind:checked
        bind:this={element}
        disabled={disabled ? true : undefined}
        {name}
        {value}
    />
{/if}

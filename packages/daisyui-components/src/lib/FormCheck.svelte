<script lang="ts">
    import type { ThemeColor, ThemeSize } from '$lib/type/Theme.js';
    import { classnames } from '$lib/util.js';

    let className = '';
    export { className as class };

    export let element: HTMLInputElement | undefined = undefined;
    export let checked = false;
    export let disabled = false;
    export let id: string | undefined = undefined;
    export let label = '';
    export let name = '';
    export let size: ThemeSize = 'md';
    export let color: ThemeColor | '' = '';
    export let type = 'checkbox' as const;
    export let value = undefined;

    /*export let group = undefined;
    export let id = undefined;
    export let inline = false;
    export let inner = undefined;
    export let invalid = false;
    export let label = '';
    export let name = '';
    export let reverse = false;
    export let size = '';
    export let type = 'checkbox';
    export let valid = false;
    export let value = undefined;*/

    $: classes = classnames(className, type, {
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
    });
    $: idFor = id || label;
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
            {...$$restProps}
            class={classes}
            id={idFor}
            type="checkbox"
            on:blur
            on:change
            on:focus
            on:input
            bind:checked
            bind:this={element}
            disabled={disabled ? true : undefined}
            {name}
            {value}
        />
    </label>
{:else}
    <input
        {...$$restProps}
        class={classes}
        id={idFor}
        type="checkbox"
        on:blur
        on:change
        on:focus
        on:input
        bind:checked
        bind:this={element}
        disabled={disabled ? true : undefined}
        {name}
        {value}
    />
{/if}

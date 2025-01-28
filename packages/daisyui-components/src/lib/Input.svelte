<script lang="ts">
    import FormCheck from './FormCheck.svelte';
    import { classnames } from '$lib/util.js';
    import type { InputType, ThemeColor, ThemeInputStyle, ThemeSize } from '$lib/type/Theme.js';

    let className = '';
    export { className as class };

    export let inputSize: ThemeSize = 'md';
    export let inputStyle: ThemeInputStyle | undefined = undefined;
    export let checked = false;
    export let color: ThemeColor | undefined = undefined;
    export let disabled = undefined;
    export let files = undefined;
    export let group = undefined;
    export let inner = undefined;
    export let invalid = false;
    export let label = undefined;
    export let multiple = undefined;
    export let name = '';
    export let placeholder = '';
    export let plaintext = false;
    export let readonly = undefined;
    export let size = undefined;
    export let type: InputType = 'text';
    export let valid = false;
    export let value = '';

    let classes;
    let tag;
    $: {
        const isNotaNumber = new RegExp('\\D', 'g');

        let isBtn = false;
        tag = 'input';

        switch (type) {
            case 'select':
                tag = 'select';
                break;
            case 'textarea':
                tag = 'textarea';
                break;
            case 'button':
            case 'reset':
            case 'submit':
                isBtn = true;
                break;
            case 'hidden':
            case 'image':
                break;
            default:
                tag = 'input';
        }
        if (plaintext) {
            tag = 'input';
        }

        if (size && isNotaNumber.test(size)) {
            console.warn('Please use the prop "inputSize" instead of the "size" for daisyui\'s input sizing.');
            inputSize = size;
            size = undefined;
        }

        if (type === 'select') {
            classes = classnames(className, 'select', {
                'select-bordered': inputStyle === 'bordered',
                'select-ghost': inputStyle === 'ghost'
            });
        } else if (type === 'range') {
            classes = classnames(className, 'range', {
                'range-primary': color === 'primary'
            });
        } else {
            classes = classnames(className, 'input', {
                'input-bordered': inputStyle === 'bordered',
                'input-ghost': inputStyle === 'ghost',
                'input-xs': inputSize === 'xs',
                'input-sm': inputSize === 'sm',
                'input-md': inputSize === 'md',
                'input-lg': inputSize === 'lg'
            });
        }
    }

    const handleInput = (event) => {
        value = event.target.value;
    };
</script>

{#if tag === 'input'}
    {#if type === 'text'}
        <input
            {...$$restProps}
            class={classes}
            type="text"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
            {size}
        />
    {:else if type === 'password'}
        <input
            {...$$restProps}
            class={classes}
            type="password"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
            {size}
        />
    {:else if type === 'color'}
        <input
            {...$$restProps}
            class={classes}
            type="color"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else if type === 'email'}
        <input
            {...$$restProps}
            class={classes}
            type="email"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {multiple}
            {name}
            {placeholder}
            {readonly}
            {size}
        />
    {:else if type === 'file'}
        <input
            {...$$restProps}
            class={classes}
            type="file"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:files
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {invalid}
            {multiple}
            {name}
            {placeholder}
            {readonly}
            {valid}
        />
    {:else if type === 'checkbox' || type === 'radio' || type === 'switch'}
        <FormCheck
            {...$$restProps}
            class={className}
            size={inputSize}
            {color}
            {type}
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:checked
            bind:inner
            bind:group
            bind:value
            disabled={disabled ? true : undefined}
            {invalid}
            {label}
            {name}
            {readonly}
            {valid}
        />
    {:else if type === 'url'}
        <input
            {...$$restProps}
            class={classes}
            type="url"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
            {size}
        />
    {:else if type === 'number'}
        <input
            {...$$restProps}
            class={classes}
            type="number"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            {readonly}
            {name}
            disabled={disabled ? true : undefined}
            {placeholder}
        />
    {:else if type === 'date'}
        <input
            {...$$restProps}
            class={classes}
            type="date"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else if type === 'time'}
        <input
            {...$$restProps}
            class={classes}
            type="time"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else if type === 'datetime'}
        <input
            {...$$restProps}
            type="datetime"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            {readonly}
            class={classes}
            {name}
            disabled={disabled ? true : undefined}
            {placeholder}
        />
    {:else if type === 'datetime-local'}
        <input
            {...$$restProps}
            class={classes}
            type="datetime-local"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else if type === 'month'}
        <input
            {...$$restProps}
            class={classes}
            type="month"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else if type === 'color'}
        <input
            {...$$restProps}
            type="color"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            {readonly}
            class={classes}
            {name}
            disabled={disabled ? true : undefined}
            {placeholder}
        />
    {:else if type === 'range'}
        <input
            {...$$restProps}
            type="range"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            {readonly}
            class={classes}
            {name}
            disabled={disabled ? true : undefined}
            {placeholder}
        />
    {:else if type === 'search'}
        <input
            {...$$restProps}
            class={classes}
            type="search"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
            {size}
        />
    {:else if type === 'tel'}
        <input
            {...$$restProps}
            class={classes}
            type="tel"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
            {size}
        />
    {:else if type === 'week'}
        <input
            {...$$restProps}
            class={classes}
            type="week"
            on:blur
            on:change
            on:focus
            on:input
            on:keydown
            on:keypress
            on:keyup
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else}
        <input
            {...$$restProps}
            {type}
            on:blur
            on:change={handleInput}
            on:focus
            on:input={handleInput}
            on:keydown
            on:keypress
            on:keyup
            {readonly}
            class={classes}
            {name}
            disabled={disabled ? true : undefined}
            {placeholder}
            {value}
        />
    {/if}
{:else if tag === 'textarea'}
    <textarea
        {...$$restProps}
        class={classes}
        on:blur
        on:change
        on:focus
        on:input
        on:keydown
        on:keypress
        on:keyup
        bind:value
        bind:this={inner}
        disabled={disabled ? true : undefined}
        {name}
        {placeholder}
        {readonly}
    />
{:else if tag === 'select' && !multiple}
    <select
        {...$$restProps}
        class={classes}
        on:blur
        on:change
        on:focus
        on:input
        bind:value
        bind:this={inner}
        {name}
        disabled={disabled ? true : undefined}
        {readonly}
    >
        <slot />
    </select>

    <!-- {:else if tag === 'select' && multiple}
    <select
      {...$$restProps}
      multiple
      class={classes}
      on:blur
      on:focus
      on:change
      on:input
      bind:value
      bind:this={inner}
      {name}
      disabled={disabled ? true : undefined}>
      <slot />
    </select> -->
{/if}

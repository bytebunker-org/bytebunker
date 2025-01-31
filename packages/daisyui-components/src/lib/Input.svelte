<script lang="ts">
    import { run, createBubbler } from 'svelte/legacy';

    const bubble = createBubbler();
    import FormCheck from './FormCheck.svelte';
    import { classnames } from '$lib/util.js';
    import type { InputType, ThemeColor, ThemeInputStyle, ThemeSize } from '$lib/type/Theme.js';

    

    interface Props {
        class?: string;
        inputSize?: ThemeSize;
        inputStyle?: ThemeInputStyle | undefined;
        checked?: boolean;
        color?: ThemeColor | undefined;
        disabled?: any;
        files?: any;
        group?: any;
        inner?: any;
        invalid?: boolean;
        label?: any;
        multiple?: any;
        name?: string;
        placeholder?: string;
        plaintext?: boolean;
        readonly?: any;
        size?: any;
        type?: InputType;
        valid?: boolean;
        value?: string;
        children?: import('svelte').Snippet;
        [key: string]: any
    }

    let {
        class: className = '',
        inputSize = $bindable('md'),
        inputStyle = undefined,
        checked = $bindable(false),
        color = undefined,
        disabled = undefined,
        files = $bindable(undefined),
        group = $bindable(undefined),
        inner = $bindable(undefined),
        invalid = false,
        label = undefined,
        multiple = undefined,
        name = '',
        placeholder = '',
        plaintext = false,
        readonly = undefined,
        size = $bindable(undefined),
        type = 'text',
        valid = false,
        value = $bindable(''),
        children,
        ...rest
    }: Props = $props();

    let classes = $state();
    let tag = $state();
    run(() => {
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
    });

    const handleInput = (event) => {
        value = event.target.value;
    };
</script>

{#if tag === 'input'}
    {#if type === 'text'}
        <input
            {...rest}
            class={classes}
            type="text"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
            {...rest}
            class={classes}
            type="password"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
            {...rest}
            class={classes}
            type="color"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else if type === 'email'}
        <input
            {...rest}
            class={classes}
            type="email"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
            {...rest}
            class={classes}
            type="file"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
            {...rest}
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
            {...rest}
            class={classes}
            type="url"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
            {...rest}
            class={classes}
            type="number"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
            bind:value
            bind:this={inner}
            {readonly}
            {name}
            disabled={disabled ? true : undefined}
            {placeholder}
        />
    {:else if type === 'date'}
        <input
            {...rest}
            class={classes}
            type="date"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else if type === 'time'}
        <input
            {...rest}
            class={classes}
            type="time"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else if type === 'datetime'}
        <input
            {...rest}
            type="datetime"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
            {...rest}
            class={classes}
            type="datetime-local"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else if type === 'month'}
        <input
            {...rest}
            class={classes}
            type="month"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else if type === 'color'}
        <input
            {...rest}
            type="color"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
            {...rest}
            type="range"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
            {...rest}
            class={classes}
            type="search"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
            {...rest}
            class={classes}
            type="tel"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
            {...rest}
            class={classes}
            type="week"
            onblur={bubble('blur')}
            onchange={bubble('change')}
            onfocus={bubble('focus')}
            oninput={bubble('input')}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
            bind:value
            bind:this={inner}
            disabled={disabled ? true : undefined}
            {name}
            {placeholder}
            {readonly}
        />
    {:else}
        <input
            {...rest}
            {type}
            onblur={bubble('blur')}
            onchange={handleInput}
            onfocus={bubble('focus')}
            oninput={handleInput}
            onkeydown={bubble('keydown')}
            onkeypress={bubble('keypress')}
            onkeyup={bubble('keyup')}
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
        {...rest}
        class={classes}
        onblur={bubble('blur')}
        onchange={bubble('change')}
        onfocus={bubble('focus')}
        oninput={bubble('input')}
        onkeydown={bubble('keydown')}
        onkeypress={bubble('keypress')}
        onkeyup={bubble('keyup')}
        bind:value
        bind:this={inner}
        disabled={disabled ? true : undefined}
        {name}
        {placeholder}
        {readonly}
></textarea>
{:else if tag === 'select' && !multiple}
    <select
        {...rest}
        class={classes}
        onblur={bubble('blur')}
        onchange={bubble('change')}
        onfocus={bubble('focus')}
        oninput={bubble('input')}
        bind:value
        bind:this={inner}
        {name}
        disabled={disabled ? true : undefined}
        {readonly}
    >
        {@render children?.()}
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

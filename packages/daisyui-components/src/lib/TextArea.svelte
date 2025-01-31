<script lang="ts">
    import { createBubbler } from 'svelte/legacy';

    const bubble = createBubbler();
    import { classnames } from './util.js';

    interface Props {
        value?: string;
        placeholder?: string;
        rows?: number;
        class_?: string;
        disabled?: boolean;
        required?: boolean;
    }

    let {
        value = $bindable(''),
        placeholder = '',
        rows = 3,
        class_ = '',
        disabled = false,
        required = false
    }: Props = $props();

    let classes = $derived(classnames(
        'textarea textarea-bordered w-full',
        {
            'textarea-disabled': disabled
        },
        class_
    ));
</script>

<textarea
    bind:value
    {rows}
    {placeholder}
    {disabled}
    {required}
    class={classes}
    oninput={bubble('input')}
    onchange={bubble('change')}
    onfocus={bubble('focus')}
    onblur={bubble('blur')}
></textarea> 
<script lang="ts">
    import { classnames } from './util.js';

    export let value = '';
    export let placeholder = '';
    export let rows = 3;
    export let class_ = '';
    export let disabled = false;
    export let required = false;

    $: classes = classnames(
        'textarea textarea-bordered w-full',
        {
            'textarea-disabled': disabled
        },
        class_
    );
</script>

<textarea
    bind:value
    {rows}
    {placeholder}
    {disabled}
    {required}
    class={classes}
    on:input
    on:change
    on:focus
    on:blur
/> 
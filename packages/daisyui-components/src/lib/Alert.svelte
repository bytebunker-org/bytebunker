<script lang="ts">
    let className = '';
    export { className as class };
    export let color: 'info' | 'success' | 'warning' | 'error' = 'info';
</script>

<div
    class="alert {color === 'info' ? 'alert-info' : ''} {color === 'success' ? 'alert-success' : ''} {color === 'warning' ? 'alert-warning' : ''} {color === 'error' ? 'alert-error' : ''} {className}"
>
    <slot />
</div> 
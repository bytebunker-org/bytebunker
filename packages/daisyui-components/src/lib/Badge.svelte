<script lang="ts">
    let className = '';
    export { className as class };
</script>

<div class="badge {className}">
    <slot />
</div> 
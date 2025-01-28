<script lang="ts">
    let className: string;
    export { className as class };
</script>

<div class="text-sm breadcrumbs {className}">
    <ul>
        <slot />
    </ul>
</div>

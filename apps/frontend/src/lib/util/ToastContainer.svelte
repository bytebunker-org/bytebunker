<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toastManager } from '$lib/util/toastManager.svelte.js';

	toastManager.onMount();
</script>

<div class="toast z-50">
	{#each toastManager.visibleToasts as toast (toast.id)}
		<div class="flex justify-end">
			<div
				role="alert"
				transition:fly={{ x: 50, duration: 200 }}
				class="alert {toast.alertClass} cursor-pointer justify-start shadow-lg transition-all hover:scale-[102%] hover:shadow-xl"
				on:click={() => toastManager.hideToast(toast.id)}
				on:keydown={() => toastManager.hideToast(toast.id)}
			>
				{#if toast.icon}
					<svelte:component this={toast.icon} class={toast.iconClass} />
				{/if}
				<span>{@html toast.message}</span>
			</div>
		</div>
	{/each}
</div>

<style>
	.alert {
		width: unset;
	}
</style>

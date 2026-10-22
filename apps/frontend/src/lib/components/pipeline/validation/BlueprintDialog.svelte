<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;

		title: string;

		/** Called when the dialog was closed by Escape or a click on the backdrop. */
		onclose?: () => void;

		children: Snippet;

		actions?: Snippet;
	}

	let { open = $bindable(), title, onclose, children, actions }: Props = $props();

	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialog) {
			return;
		}

		if (open && !dialog.open) {
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});
</script>

<dialog
	bind:this={dialog}
	class="modal"
	onclose={() => {
		if (open) {
			open = false;
			onclose?.();
		}
	}}
>
	<div class="modal-box flex max-h-[90vh] w-11/12 max-w-3xl flex-col gap-3">
		<h3 class="text-lg font-bold">{title}</h3>
		<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
			{@render children()}
		</div>
		{#if actions}
			<div class="modal-action mt-0">
				{@render actions()}
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Schließen">close</button>
	</form>
</dialog>

<script lang="ts">
	import BlueprintDialog from '$lib/components/pipeline/validation/BlueprintDialog.svelte';
	import LucideCopy from '~icons/lucide/copy';
	import LucideDownload from '~icons/lucide/download';
	import { toastManager } from '$lib/util/toastManager.svelte.js';

	interface Props {
		open: boolean;

		/** Formatted JSON text. */
		json: string;

		fileName?: string;
	}

	let { open = $bindable(), json, fileName = 'blueprint' }: Props = $props();

	async function copy() {
		try {
			await navigator.clipboard.writeText(json);
			toastManager.showSuccess('JSON wurde kopiert');
		} catch (error) {
			console.error(error);
			toastManager.showError('JSON konnte nicht kopiert werden!');
		}
	}

	function download() {
		const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
		const link = document.createElement('a');

		link.href = url;
		link.download = `${fileName.replace(/[^\w.-]+/g, '_') || 'blueprint'}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<BlueprintDialog bind:open title="Blueprint als JSON">
	<textarea
		class="textarea textarea-bordered min-h-96 w-full font-mono text-xs"
		readonly
		spellcheck="false"
		value={json}
	></textarea>

	{#snippet actions()}
		<button class="btn btn-ghost" onclick={() => (open = false)}>Schließen</button>
		<button class="btn btn-outline" onclick={download}>
			<LucideDownload class="size-4" />
			Herunterladen
		</button>
		<button class="btn btn-primary" onclick={copy}>
			<LucideCopy class="size-4" />
			Kopieren
		</button>
	{/snippet}
</BlueprintDialog>

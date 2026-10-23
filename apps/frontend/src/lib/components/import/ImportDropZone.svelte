<script lang="ts">
	import type { ImportUploadEntry } from '$lib/api/ImportApi.js';
	import LucideUpload from '~icons/lucide/upload';
	import LucideFolderOpen from '~icons/lucide/folder-open';
	import LucideFiles from '~icons/lucide/files';
	import { collectFromDataTransfer, collectFromFileList } from './collectFiles.js';
	import { toastManager } from '$lib/util/toastManager.svelte.js';

	interface Props {
		onfiles: (entries: ImportUploadEntry[]) => void;
		disabled?: boolean;
	}

	let { onfiles, disabled = false }: Props = $props();

	let dragging = $state(false);
	let reading = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let folderInput: HTMLInputElement | undefined = $state();

	async function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (disabled || !event.dataTransfer) return;

		reading = true;
		try {
			const entries = await collectFromDataTransfer(event.dataTransfer);
			if (entries.length > 0) onfiles(entries);
		} catch (error) {
			console.error(error);
			toastManager.showError('Dateien konnten nicht gelesen werden');
		} finally {
			reading = false;
		}
	}

	function onPick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const entries = collectFromFileList(input.files);
		if (entries.length > 0) onfiles(entries);
		input.value = '';
	}
</script>

<div
	role="region"
	aria-label="Dateien hierher ziehen"
	class="rounded-box flex flex-col items-center gap-3 border-2 border-dashed p-10 text-center transition-colors
		{dragging ? 'border-primary bg-primary/10' : 'border-base-content/30 bg-base-100'}
		{disabled ? 'opacity-50' : ''}"
	ondragover={(event) => {
		event.preventDefault();
		if (!disabled) dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
>
	{#if reading}
		<span class="loading loading-spinner loading-lg"></span>
		<p>Lese Dateien…</p>
	{:else}
		<LucideUpload class="text-base-content/60 size-10" />
		<p class="font-semibold">Dateien, Ordner oder ZIP-Archive hierher ziehen</p>
		<p class="text-base-content/60 text-sm">
			z. B. ein komplettes Google Takeout. ZIPs werden im Browser gelesen; hochgeladen wird nur, was
			ein Importer liest.
		</p>
		<div class="flex gap-2">
			<button class="btn btn-sm" {disabled} onclick={() => fileInput?.click()}>
				<LucideFiles class="size-4" />
				Dateien wählen
			</button>
			<button class="btn btn-sm" {disabled} onclick={() => folderInput?.click()}>
				<LucideFolderOpen class="size-4" />
				Ordner wählen
			</button>
		</div>
	{/if}

	<input bind:this={fileInput} type="file" multiple class="hidden" onchange={onPick} />
	<input
		bind:this={folderInput}
		type="file"
		multiple
		class="hidden"
		onchange={onPick}
		{...{ webkitdirectory: true }}
	/>
</div>

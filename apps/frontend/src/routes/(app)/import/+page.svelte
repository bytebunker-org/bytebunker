<script lang="ts">
	import { createMutation } from '@tanstack/svelte-query';
	import type { FileImportBatchResultDto } from '@bytebunker/backend';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import ToolbarButton from '$lib/components/ToolbarButton.svelte';
	import ImportDropZone from '$lib/components/import/ImportDropZone.svelte';
	import ImportResultTable from '$lib/components/import/ImportResultTable.svelte';
	import { formatBytes } from '$lib/components/import/collectFiles.js';
	import { ImportApi, type ImportUploadEntry } from '$lib/api/ImportApi.js';
	import { toastManager } from '$lib/util/toastManager.svelte.js';
	import LucideUpload from '~icons/lucide/upload';
	import LucideTrash from '~icons/lucide/trash-2';
	import LucideX from '~icons/lucide/x';

	let entries = $state<ImportUploadEntry[]>([]);
	let dryRun = $state(true);
	let allowReimport = $state(false);
	let uploadFraction = $state(0);
	let result = $state<FileImportBatchResultDto>();
	let errorMessage = $state<string>();

	const LIST_LIMIT = 100;
	let totalSize = $derived(entries.reduce((sum, entry) => sum + entry.file.size, 0));

	const uploadMutation = createMutation(() => ({
		mutationFn: () =>
			ImportApi.upload($state.snapshot(entries) as ImportUploadEntry[], {
				dryRun,
				allowReimport,
				onProgress: (loaded, total) => (uploadFraction = total > 0 ? loaded / total : 0)
			})
	}));

	function addEntries(added: ImportUploadEntry[]) {
		const known = new Set(entries.map((entry) => entry.path));
		entries.push(...added.filter((entry) => !known.has(entry.path)));
	}

	async function upload() {
		errorMessage = undefined;
		uploadFraction = 0;
		try {
			result = await uploadMutation.mutateAsync();
			entries = [];
			toastManager.showSuccess(dryRun ? 'Testlauf abgeschlossen' : 'Import gestartet');
		} catch (error) {
			console.error(error);
			errorMessage = error instanceof Error ? error.message : 'Upload fehlgeschlagen';
			toastManager.showError('Upload fehlgeschlagen');
		}
	}
</script>

<MainLayout icon={LucideUpload} title="Import">
	{#snippet toolbar()}
		<ToolbarButton
			icon={LucideTrash}
			tooltip="Auswahl leeren"
			onclick={() => !uploadMutation.isPending && (entries = [])}
		/>
	{/snippet}

	<div class="flex flex-col gap-6 pb-12">
		<ImportDropZone onfiles={addEntries} disabled={uploadMutation.isPending} />

		<p class="text-base-content/60 text-sm">
			Sehr große Exporte kannst du auch direkt in den Import-Ordner auf dem Server kopieren, statt
			sie hochzuladen.
		</p>

		{#if entries.length > 0}
			<section class="bg-base-100 rounded-box flex flex-col gap-4 p-4">
				<h2 class="font-semibold">
					{entries.length} Datei(en) ausgewählt · {formatBytes(totalSize)}
				</h2>

				<ul class="divide-base-content/10 max-h-64 divide-y overflow-y-auto text-sm">
					{#each entries.slice(0, LIST_LIMIT) as entry (entry.path)}
						<li class="flex items-center justify-between gap-2 py-1">
							<span class="truncate" title={entry.path}>{entry.path}</span>
							<span class="text-base-content/60 flex shrink-0 items-center gap-2">
								{formatBytes(entry.file.size)}
								<button
									class="btn btn-ghost btn-xs btn-circle"
									aria-label="Entfernen"
									disabled={uploadMutation.isPending}
									onclick={() => (entries = entries.filter((other) => other !== entry))}
								>
									<LucideX class="size-4" />
								</button>
							</span>
						</li>
					{/each}
				</ul>
				{#if entries.length > LIST_LIMIT}
					<p class="text-base-content/60 text-xs">… und {entries.length - LIST_LIMIT} weitere</p>
				{/if}

				<div class="flex flex-col gap-2">
					<label class="flex cursor-pointer items-start gap-3">
						<input type="checkbox" class="toggle toggle-primary" bind:checked={dryRun} />
						<span>
							<span class="font-medium">Dry run</span>
							<span class="text-base-content/60 block text-sm">
								Nichts wird geschrieben; zeigt, was importiert würde
							</span>
						</span>
					</label>
					<label class="flex cursor-pointer items-start gap-3">
						<input type="checkbox" class="toggle" bind:checked={allowReimport} />
						<span>
							<span class="font-medium">Re-import erlauben</span>
							<span class="text-base-content/60 block text-sm">
								Auch Dateien importieren, die bereits früher importiert wurden
							</span>
						</span>
					</label>
				</div>

				{#if uploadMutation.isPending}
					<div class="flex flex-col gap-1">
						<progress
							class="progress progress-primary w-full"
							value={uploadFraction * 100}
							max="100"
						></progress>
						<span class="text-base-content/60 text-xs">
							{uploadFraction >= 1
								? 'Server verarbeitet die Dateien…'
								: `Upload ${Math.round(uploadFraction * 100)} %`}
						</span>
					</div>
				{/if}

				<div>
					<button class="btn btn-primary" disabled={uploadMutation.isPending} onclick={upload}>
						<LucideUpload class="size-4" />
						{dryRun ? 'Testlauf starten' : 'Importieren'}
					</button>
				</div>
			</section>
		{/if}

		{#if errorMessage}
			<div role="alert" class="alert alert-error">
				<span>{errorMessage}</span>
			</div>
		{/if}

		{#if result}
			<section class="flex flex-col gap-2">
				<h2 class="text-lg font-semibold">Ergebnis</h2>
				<ImportResultTable bind:result />
			</section>
		{:else if entries.length === 0 && !errorMessage}
			<p class="text-base-content/60 py-4 text-center">Noch nichts ausgewählt.</p>
		{/if}
	</div>
</MainLayout>

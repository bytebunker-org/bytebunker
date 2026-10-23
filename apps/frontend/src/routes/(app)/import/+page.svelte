<script lang="ts">
	import type { FileImportBatchResultDto, FileImportOutcome } from '@bytebunker/backend';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import ToolbarButton from '$lib/components/ToolbarButton.svelte';
	import ImportDropZone from '$lib/components/import/ImportDropZone.svelte';
	import ImportPreview from '$lib/components/import/ImportPreview.svelte';
	import ImportResultTable from '$lib/components/import/ImportResultTable.svelte';
	import { formatBytes } from '$lib/components/import/collectFiles.js';
	import {
		batchBySize,
		createItems,
		headSize,
		isUploadable,
		PREVIEW_BATCH_BYTES,
		PREVIEW_BATCH_FILES,
		refreshDuplicates,
		toSources,
		UPLOAD_BATCH_BYTES,
		type ImportItem
	} from '$lib/components/import/importSelection.js';
	import { ImportApi, type ImportUploadEntry } from '$lib/api/ImportApi.js';
	import { toastManager } from '$lib/util/toastManager.svelte.js';
	import LucideUpload from '~icons/lucide/upload';
	import LucideTrash from '~icons/lucide/trash-2';
	import LucideX from '~icons/lucide/x';

	const PREVIEW_CONCURRENCY = 3;
	/** The server accepts at most 5000 files per upload request. */
	const UPLOAD_BATCH_FILES = 1000;

	/** Raw: can hold tens of thousands of takeout entries; updated by reassigning a new array. */
	let items = $state.raw<ImportItem[]>([]);
	let dryRun = $state(true);
	let allowReimport = $state(false);
	let analysing = $state(false);
	let uploading = $state(false);
	let uploadFraction = $state(0);
	let uploadStep = $state({ batch: 0, of: 0 });
	let uploadAbort: AbortController | undefined;
	let result = $state<FileImportBatchResultDto>();
	let errorMessage = $state<string>();
	let readErrors = $state<string[]>([]);

	let analysable = $derived(items.filter((item) => !item.ignored));
	let analysed = $derived(
		analysable.filter((item) => item.status === 'done' || item.status === 'error')
	);
	let uploadable = $derived(items.filter(isUploadable));
	let uploadBytes = $derived(uploadable.reduce((sum, item) => sum + item.source.size, 0));

	function refresh() {
		items = [...items];
	}

	async function addEntries(added: ImportUploadEntry[]) {
		// Only zip central directories are read here; file contents stay on disk until analysis / upload.
		const { sources, errors } = await toSources(added);
		readErrors = [...readErrors, ...errors];
		items = [...items, ...createItems(sources, items)];
		void analyse();
	}

	async function analyseBatch(batch: ImportItem[]) {
		for (const item of batch) item.status = 'analysing';
		refresh();
		try {
			// One unreadable entry (e.g. a corrupt zip member) must not fail the whole batch
			const read = await Promise.all(
				batch.map(async (item) => {
					try {
						return { item, head: await item.source.readHead() };
					} catch (error) {
						item.status = 'error';
						item.error = error instanceof Error ? error.message : 'Datei nicht lesbar';
						return undefined;
					}
				})
			);
			const readable = read.filter((entry) => entry !== undefined);
			if (readable.length === 0) return;
			const { files } = await ImportApi.preview(
				readable.map(({ item, head }) => ({ path: item.source.path, size: item.source.size, head }))
			);
			readable.forEach(({ item }, index) => {
				item.preview = files[index];
				item.status = files[index] ? 'done' : 'error';
				if (!files[index]) item.error = 'Keine Antwort für diese Datei';
			});
		} catch (error) {
			console.error(error);
			for (const item of batch.filter((item) => item.status === 'analysing')) {
				item.status = 'error';
				item.error = error instanceof Error ? error.message : 'Analyse fehlgeschlagen';
			}
		}
		refresh();
	}

	/** Sends the heads of all not yet analysed files, a few batches in parallel. */
	async function analyse() {
		if (analysing) return;
		analysing = true;
		try {
			let pending: ImportItem[];
			while ((pending = items.filter((item) => item.status === 'pending')).length > 0) {
				const queue = batchBySize(
					pending,
					(item) => headSize(item.source),
					PREVIEW_BATCH_BYTES,
					PREVIEW_BATCH_FILES
				);
				const worker = async () => {
					for (let batch = queue.shift(); batch; batch = queue.shift()) {
						await analyseBatch(batch);
					}
				};
				await Promise.all(Array.from({ length: PREVIEW_CONCURRENCY }, worker));
			}
		} finally {
			analysing = false;
		}
	}

	function retryFailed() {
		for (const item of items) {
			if (item.status === 'error') {
				item.status = 'pending';
				item.error = undefined;
			}
		}
		refresh();
		void analyse();
	}

	function mergeResult(into: FileImportBatchResultDto, batch: FileImportBatchResultDto) {
		into.files.push(...batch.files);
		for (const [outcome, count] of Object.entries(batch.summary) as [FileImportOutcome, number][]) {
			into.summary[outcome] = (into.summary[outcome] ?? 0) + count;
		}
	}

	/** Uploads the importable files in sequential requests below the Cloudflare body limit. */
	async function startImport() {
		const targets = uploadable;
		if (targets.length === 0) return;

		const batches = batchBySize(
			targets,
			(item) => item.source.size,
			UPLOAD_BATCH_BYTES,
			UPLOAD_BATCH_FILES
		);
		const totalBytes = Math.max(1, uploadBytes);
		// Snapshot: every batch of one run uses the same options
		const options = { dryRun, allowReimport };
		const merged: FileImportBatchResultDto = { dryRun: options.dryRun, files: [], summary: {} };
		const uploaded = new Set<ImportItem>();
		let doneBytes = 0;

		uploading = true;
		uploadFraction = 0;
		errorMessage = undefined;
		result = undefined;
		uploadAbort = new AbortController();
		const signal = uploadAbort.signal;

		try {
			for (const [index, batch] of batches.entries()) {
				uploadStep = { batch: index + 1, of: batches.length };
				const batchBytes = batch.reduce((sum, item) => sum + item.source.size, 0);
				// Zip entries are inflated only now, one batch (≤ 90 MB) at a time
				const entries = await Promise.all(
					batch.map(async (item) => ({ file: await item.source.read(), path: item.source.path }))
				);
				const batchResult = await ImportApi.upload(entries, {
					...options,
					signal,
					onProgress: (loaded, total) =>
						(uploadFraction =
							(doneBytes + (total > 0 ? loaded / total : 0) * batchBytes) / totalBytes)
				});
				mergeResult(merged, batchResult);
				batch.forEach((item) => uploaded.add(item));
				doneBytes += batchBytes;
			}
			toastManager.showSuccess(options.dryRun ? 'Testlauf abgeschlossen' : 'Import gestartet');
			// Done: what is left was not importable anyway
			uploaded.clear();
			items = [];
			readErrors = [];
		} catch (error) {
			console.error(error);
			errorMessage =
				(error instanceof Error ? error.message : 'Upload fehlgeschlagen') +
				(uploaded.size > 0
					? ` – ${uploaded.size} von ${targets.length} Dateien wurden bereits übertragen.`
					: '');
			toastManager.showError('Upload fehlgeschlagen');
		} finally {
			uploading = false;
			uploadAbort = undefined;
			// After a failure the uploaded files leave the selection, so a retry continues with the rest
			if (uploaded.size > 0) {
				items = items.filter((item) => !uploaded.has(item));
				refreshDuplicates(items);
			}
			if (merged.files.length > 0) result = merged;
		}
	}

	function clear() {
		if (uploading) return;
		items = [];
		readErrors = [];
	}
</script>

<MainLayout icon={LucideUpload} title="Import">
	{#snippet toolbar()}
		<ToolbarButton icon={LucideTrash} tooltip="Auswahl leeren" onclick={clear} />
	{/snippet}

	<div class="flex flex-col gap-6 pb-12">
		<ImportDropZone onfiles={addEntries} disabled={uploading} />

		<p class="text-base-content/60 text-sm">
			Dateien werden zuerst nur angelesen und zugeordnet; hochgeladen wird erst mit „Import
			starten“, und nur was ein Importer liest. Einzelne Dateien über 95 MB passen nicht durch
			Cloudflare – kopiere sie direkt in den Import-Ordner auf dem Server.
		</p>

		{#if readErrors.length > 0}
			<div role="alert" class="alert alert-warning flex flex-col items-start gap-1">
				<span class="font-medium">Nicht alles konnte gelesen werden:</span>
				<ul class="text-sm">
					{#each readErrors.slice(0, 20) as message}
						<li>{message}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if items.length > 0}
			<section class="bg-base-100 rounded-box flex flex-col gap-4 p-4">
				{#if analysing}
					<div class="flex flex-col gap-1">
						<progress
							class="progress progress-info w-full"
							value={analysed.length}
							max={Math.max(1, analysable.length)}
						></progress>
						<span class="text-base-content/60 text-xs">
							Analysiere {analysed.length} / {analysable.length} Dateien…
						</span>
					</div>
				{/if}

				<ImportPreview {items} disabled={uploading} onchange={refresh} onretry={retryFailed} />

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

				{#if uploading}
					<div class="flex flex-col gap-1">
						<progress
							class="progress progress-primary w-full"
							value={uploadFraction * 100}
							max="100"
						></progress>
						<span class="text-base-content/60 text-xs">
							Teil {uploadStep.batch} / {uploadStep.of} ·
							{uploadFraction >= 1
								? 'Server verarbeitet die Dateien…'
								: `Upload ${Math.round(uploadFraction * 100)} %`}
						</span>
					</div>
				{/if}

				<div class="flex flex-wrap items-center gap-3">
					<button
						class="btn btn-primary"
						disabled={uploading || analysing || uploadable.length === 0}
						onclick={startImport}
					>
						{#if uploading}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<LucideUpload class="size-4" />
						{/if}
						{dryRun ? 'Testlauf starten' : 'Import starten'}
						{#if uploadable.length > 0}
							({uploadable.length} Dateien · {formatBytes(uploadBytes)})
						{/if}
					</button>
					{#if uploading}
						<button class="btn btn-ghost" onclick={() => uploadAbort?.abort()}>
							<LucideX class="size-4" />
							Abbrechen
						</button>
					{:else if analysing}
						<span class="text-base-content/60 text-sm">Warte auf die Analyse…</span>
					{/if}
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
		{:else if items.length === 0 && !errorMessage}
			<p class="text-base-content/60 py-4 text-center">Noch nichts ausgewählt.</p>
		{/if}
	</div>
</MainLayout>

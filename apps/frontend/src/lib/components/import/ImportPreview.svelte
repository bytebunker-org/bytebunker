<script lang="ts">
	import type { FileImportMatchSource } from '@bytebunker/backend';
	import { formatBytes } from './collectFiles.js';
	import { categorize, hasConflict, type ImportItem } from './importSelection.js';
	import LucideTriangleAlert from '~icons/lucide/triangle-alert';

	interface Props {
		items: ImportItem[];
		disabled?: boolean;
		/** Called after an item's `excluded` flag was changed in place. */
		onchange: () => void;
		onretry: () => void;
	}

	let { items, disabled = false, onchange, onretry }: Props = $props();

	const LIST_LIMIT = 200;

	const matchedByLabel: Record<FileImportMatchSource, string> = {
		glob: 'Dateiname',
		'content-pattern': 'Inhaltsmuster',
		'content-detection': 'Inhaltserkennung'
	};

	interface Group {
		key: string;
		titles: string[];
		formats: string[];
		items: ImportItem[];
		bytes: number;
	}

	let byCategory = $derived.by(() => {
		const out = {
			importable: [] as ImportItem[],
			unmatched: [] as ImportItem[],
			ignored: [] as ImportItem[],
			pending: [] as ImportItem[],
			error: [] as ImportItem[]
		};
		for (const item of items) out[categorize(item)].push(item);
		return out;
	});

	/** Importable files grouped by the blueprint(s) that would read them; several blueprints form their own group. */
	let groups = $derived.by(() => {
		const map = new Map<string, Group>();
		for (const item of byCategory.importable) {
			const titles = item.preview!.matches.map((match) => match.blueprintTitle);
			const key = titles.join(' + ');
			let group = map.get(key);
			if (!group) {
				group = { key, titles, formats: [], items: [], bytes: 0 };
				map.set(key, group);
			}
			group.items.push(item);
			group.bytes += item.source.size;
			const format = item.preview!.format;
			if (format && !group.formats.includes(format)) group.formats.push(format);
		}
		return [...map.values()].sort((a, b) => b.items.length - a.items.length);
	});

	let conflicts = $derived(byCategory.importable.filter(hasConflict));
	let tooLarge = $derived(byCategory.importable.filter((item) => item.tooLarge));
	let importedBefore = $derived(
		byCategory.importable.filter((item) => (item.preview?.previousImports.length ?? 0) > 0)
	);

	function previousImportTitle(item: ImportItem): string {
		const lines = (item.preview?.previousImports ?? []).map(
			(previous) =>
				`${previous.blueprintTitle}: Ausführung #${previous.executionId} am ${new Date(previous.importedAt).toLocaleString('de-DE')}`
		);
		return `Eine Datei mit gleichem Namen und gleicher Größe wurde schon importiert. Ohne „Re-import erlauben“ wird sie vermutlich übersprungen.\n${lines.join('\n')}`;
	}

	function setExcluded(targets: ImportItem[], excluded: boolean) {
		for (const item of targets) item.excluded = excluded;
		onchange();
	}

	function selectable(item: ImportItem): boolean {
		return !item.tooLarge && !item.duplicate;
	}

	function conflictReasons(item: ImportItem): string[] {
		const reasons: string[] = [];
		if (item.preview?.conflict) {
			reasons.push(
				`${item.preview.matches.length} Blueprints würden die Datei importieren: ${item.preview.matches
					.map((match) => `„${match.blueprintTitle}“`)
					.join(', ')}`
			);
		}
		if (item.duplicate)
			reasons.push(
				'Gleicher Pfad kommt in der Auswahl mehrfach vor; nur der erste wird hochgeladen'
			);
		if (item.tooLarge) {
			reasons.push(
				'Zu groß für Upload über Cloudflare (100 MB), bitte in den Import-Ordner kopieren'
			);
		}
		return reasons;
	}

	function formatConfidence(confidence: number): string {
		return `${Math.round(confidence * 100)} %`;
	}
</script>

{#snippet path(item: ImportItem)}
	<span class="break-all" title={item.source.path}>{item.source.path}</span>
	{#if item.source.archive}
		<span class="badge badge-ghost badge-xs ml-1" title="aus {item.source.archive}">
			{item.source.archive.split('/').pop()}
		</span>
	{/if}
{/snippet}

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center gap-2 text-sm">
		<span class="font-semibold">{items.length} Dateien</span>
		<span class="badge badge-success">{byCategory.importable.length} importierbar</span>
		{#if byCategory.unmatched.length > 0}
			<span class="badge badge-neutral">{byCategory.unmatched.length} nicht erkannt</span>
		{/if}
		{#if byCategory.ignored.length > 0}
			<span class="badge badge-ghost">{byCategory.ignored.length} ignoriert</span>
		{/if}
		{#if tooLarge.length > 0}
			<span class="badge badge-warning">{tooLarge.length} zu groß</span>
		{/if}
		{#if conflicts.length > 0}
			<span class="badge badge-warning">{conflicts.length} Konflikte</span>
		{/if}
		{#if importedBefore.length > 0}
			<span
				class="badge badge-info"
				title="Gleicher Name und gleiche Größe wie eine früher importierte Datei; ohne „Re-import erlauben“ vermutlich übersprungen"
			>
				{importedBefore.length} vermutlich schon importiert
			</span>
		{/if}
		{#if byCategory.pending.length > 0}
			<span class="badge badge-info badge-outline">{byCategory.pending.length} in Analyse</span>
		{/if}
		{#if byCategory.error.length > 0}
			<span class="badge badge-error">{byCategory.error.length} Fehler</span>
		{/if}
	</div>

	{#if conflicts.length > 0}
		<div class="border-warning/50 bg-warning/10 rounded-box flex flex-col gap-2 border p-3">
			<h3 class="flex items-center gap-2 font-semibold">
				<LucideTriangleAlert class="text-warning size-4" />
				Konflikte
			</h3>
			<ul class="flex max-h-64 flex-col gap-2 overflow-y-auto text-sm">
				{#each conflicts.slice(0, LIST_LIMIT) as item (item.source.key)}
					<li>
						<div>{@render path(item)}</div>
						<ul class="text-base-content/70 list-disc pl-5 text-xs">
							{#each conflictReasons(item) as reason}
								<li>{reason}</li>
							{/each}
						</ul>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#each groups as group (group.key)}
		{@const included = group.items.filter((item) => !item.excluded && selectable(item))}
		{@const choosable = group.items.filter(selectable)}
		<details class="border-base-content/10 rounded-box border" open={groups.length <= 3}>
			<summary class="flex cursor-pointer flex-wrap items-center gap-3 p-3">
				<input
					type="checkbox"
					class="checkbox checkbox-sm checkbox-primary"
					aria-label="Alle in {group.key} auswählen"
					{disabled}
					checked={included.length > 0 && included.length === choosable.length}
					indeterminate={included.length > 0 && included.length < choosable.length}
					onclick={(event) => event.stopPropagation()}
					onchange={(event) => setExcluded(choosable, !event.currentTarget.checked)}
				/>
				<span class="font-semibold">
					{group.titles.map((title) => `„${title}“`).join(' + ')}
				</span>
				{#if group.titles.length > 1}
					<span class="badge badge-warning badge-sm">mehrere Blueprints</span>
				{/if}
				<span class="text-base-content/60 text-sm">
					{group.items.length} Dateien · {formatBytes(group.bytes)}
					{#if group.formats.length > 0}· {group.formats.join(', ')}{/if}
				</span>
			</summary>
			<div class="overflow-x-auto px-3 pb-3">
				<table class="table-xs table">
					<thead>
						<tr>
							<th></th>
							<th>Datei</th>
							<th class="text-right">Größe</th>
							<th>Format</th>
							<th>Erkannt über</th>
						</tr>
					</thead>
					<tbody>
						{#each group.items.slice(0, LIST_LIMIT) as item (item.source.key)}
							{@const preview = item.preview!}
							<tr class={item.excluded || !selectable(item) ? 'opacity-50' : ''}>
								<td>
									<input
										type="checkbox"
										class="checkbox checkbox-xs"
										aria-label="{item.source.path} importieren"
										disabled={disabled || !selectable(item)}
										checked={!item.excluded && selectable(item)}
										onchange={(event) => setExcluded([item], !event.currentTarget.checked)}
									/>
								</td>
								<td class="max-w-96">
									{@render path(item)}
									{#if item.tooLarge}
										<span class="badge badge-warning badge-xs ml-1">zu groß</span>
									{/if}
									{#if item.duplicate}
										<span class="badge badge-warning badge-xs ml-1">doppelt</span>
									{/if}
									{#if item.preview?.previousImports.length}
										<span class="badge badge-info badge-xs ml-1" title={previousImportTitle(item)}>
											schon importiert?
										</span>
									{/if}
								</td>
								<td class="text-right whitespace-nowrap">{formatBytes(item.source.size)}</td>
								<td>
									{preview.format ?? '–'}
									{#if preview.confidence !== undefined}
										<span class="text-base-content/60"
											>({formatConfidence(preview.confidence)})</span
										>
									{/if}
								</td>
								<td>
									{#each preview.matches as match}
										<span class="badge badge-outline badge-xs mr-1" title={match.blueprintTitle}>
											{matchedByLabel[match.matchedBy]}
										</span>
									{/each}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if group.items.length > LIST_LIMIT}
					<p class="text-base-content/60 mt-1 text-xs">
						… und {group.items.length - LIST_LIMIT} weitere
					</p>
				{/if}
			</div>
		</details>
	{/each}

	{#if byCategory.unmatched.length > 0}
		<details class="border-base-content/10 rounded-box border">
			<summary class="cursor-pointer p-3">
				<span class="font-semibold">Nicht erkannt</span>
				<span class="text-base-content/60 text-sm">
					· {byCategory.unmatched.length} Dateien, werden nicht hochgeladen
				</span>
			</summary>
			<ul class="divide-base-content/10 max-h-80 divide-y overflow-y-auto px-3 pb-3 text-sm">
				{#each byCategory.unmatched.slice(0, LIST_LIMIT) as item (item.source.key)}
					<li class="py-1">
						<div>
							{@render path(item)}
							{#if item.preview?.unsupportedFormat}
								<span class="badge badge-warning badge-xs ml-1">noch kein Importer</span>
							{/if}
						</div>
						{#if item.preview?.message}
							<div class="text-base-content/60 text-xs">{item.preview.message}</div>
						{/if}
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	{#if byCategory.error.length > 0}
		<div class="border-error/50 rounded-box flex flex-col gap-2 border p-3">
			<div class="flex items-center justify-between gap-2">
				<h3 class="font-semibold">Analyse fehlgeschlagen ({byCategory.error.length})</h3>
				<button class="btn btn-xs" {disabled} onclick={onretry}>Erneut versuchen</button>
			</div>
			<ul class="max-h-40 overflow-y-auto text-sm">
				{#each byCategory.error.slice(0, 50) as item (item.source.key)}
					<li>{@render path(item)} <span class="text-error text-xs">{item.error}</span></li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if byCategory.ignored.length > 0}
		<details class="border-base-content/10 rounded-box border">
			<summary class="cursor-pointer p-3">
				<span class="font-semibold">Ignoriert</span>
				<span class="text-base-content/60 text-sm">
					· {byCategory.ignored.length} Medien- und Systemdateien, werden nicht hochgeladen
				</span>
			</summary>
			<ul class="max-h-60 overflow-y-auto px-3 pb-3 text-xs">
				{#each byCategory.ignored.slice(0, LIST_LIMIT) as item (item.source.key)}
					<li>{@render path(item)}</li>
				{/each}
			</ul>
			{#if byCategory.ignored.length > LIST_LIMIT}
				<p class="text-base-content/60 px-3 pb-3 text-xs">
					… und {byCategory.ignored.length - LIST_LIMIT} weitere
				</p>
			{/if}
		</details>
	{/if}
</div>

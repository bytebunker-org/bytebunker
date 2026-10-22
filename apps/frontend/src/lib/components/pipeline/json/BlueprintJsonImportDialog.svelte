<script lang="ts">
	import type { BlueprintValidationResultDto } from '@bytebunker/backend';
	import { PipelineBlueprintApi } from '$lib/api/PipelineBlueprintApi.js';
	import BlueprintDialog from '$lib/components/pipeline/validation/BlueprintDialog.svelte';
	import BlueprintIssueList from '$lib/components/pipeline/validation/BlueprintIssueList.svelte';
	import {
		countIssues,
		editorBlockingIssueCodes
	} from '$lib/components/pipeline/validation/blueprintValidation.js';
	import {
		parseBlueprintJson,
		type ParsedBlueprintJson
	} from '$lib/components/pipeline/json/blueprintJson.js';

	interface Props {
		open: boolean;

		/** replace: replaces the editor content. create: creates a new blueprint (asks for a title). */
		mode: 'replace' | 'create';

		onsubmit: (value: ParsedBlueprintJson & { title?: string }) => Promise<void> | void;
	}

	let { open = $bindable(), mode, onsubmit }: Props = $props();

	let text = $state('');
	let title = $state('');
	let titleTouched = $state(false);
	let parseError = $state<string>();
	let checking = $state(false);
	let submitting = $state(false);
	let requestError = $state<string>();
	let checked = $state<{
		text: string;
		parsed: ParsedBlueprintJson;
		result: BlueprintValidationResultDto;
	}>();

	let counts = $derived(countIssues(checked?.result.issues ?? []));
	let isCurrent = $derived(checked?.text === text);
	let blocked = $derived(
		mode === 'replace' &&
			!!checked?.result.issues.some((i) => editorBlockingIssueCodes.includes(i.code))
	);
	let needsTitle = $derived(mode === 'create' && !title.trim());

	$effect(() => {
		// Reset when the dialog is opened again
		if (open) {
			return;
		}

		text = '';
		title = '';
		titleTouched = false;
		parseError = undefined;
		requestError = undefined;
		checked = undefined;
	});

	async function check(): Promise<typeof checked> {
		parseError = undefined;
		requestError = undefined;

		const parsed = parseBlueprintJson(text);

		if (!parsed.ok) {
			parseError = parsed.error;
			checked = undefined;

			return undefined;
		}

		if (!titleTouched && parsed.value.title) {
			title = parsed.value.title;
		}

		checking = true;

		try {
			const result = await PipelineBlueprintApi.validate(parsed.value.data);

			checked = { text, parsed: parsed.value, result };
		} catch (error) {
			console.error(error);
			requestError = error instanceof Error ? error.message : String(error);
			checked = undefined;
		} finally {
			checking = false;
		}

		return checked;
	}

	async function submit(force: boolean) {
		const current = isCurrent && checked ? checked : await check();

		if (!current || needsTitle) {
			return;
		}

		// Clean (or only warnings): apply right away. Otherwise show the issues first.
		if (!force && current.result.issues.some((i) => i.severity === 'error')) {
			return;
		}

		submitting = true;

		try {
			await onsubmit({ ...current.parsed, title: title.trim() || current.parsed.title });
			open = false;
		} catch {
			// The caller reports the failure; keep the dialog open so the pasted JSON is not lost.
		} finally {
			submitting = false;
		}
	}
</script>

<BlueprintDialog
	bind:open
	title={mode === 'replace' ? 'JSON einfügen' : 'Blueprint aus JSON erstellen'}
>
	<p class="text-base-content/70 text-sm">
		{#if mode === 'replace'}
			Der Inhalt des Editors wird nach der Prüfung ersetzt (gespeichert wird erst mit „Speichern“).
		{:else}
			Der Blueprint wird nach der Prüfung angelegt.
		{/if}
		Erlaubt sind <code>{'{ nodes, edges }'}</code> oder ein Objekt mit <code>title</code> und
		<code>data</code>, auch in einem Markdown-Codeblock. Fehlende Positionen werden automatisch
		berechnet.
	</p>

	{#if mode === 'create'}
		<label class="form-control w-full">
			<span class="mb-1 text-sm font-medium">Titel</span>
			<input
				class="input input-bordered w-full"
				placeholder="Titel des Blueprints"
				bind:value={title}
				oninput={() => (titleTouched = true)}
			/>
		</label>
	{/if}

	<textarea
		class="textarea textarea-bordered min-h-64 w-full font-mono text-xs"
		placeholder={'{ "nodes": [ ... ], "edges": [ ... ] }'}
		spellcheck="false"
		bind:value={text}
	></textarea>

	{#if parseError}
		<div role="alert" class="alert alert-error alert-soft py-2 text-sm">{parseError}</div>
	{/if}
	{#if requestError}
		<div role="alert" class="alert alert-error alert-soft py-2 text-sm">
			Prüfung fehlgeschlagen: {requestError}
		</div>
	{/if}

	{#if checked}
		{#if checked.parsed.notes.length}
			<ul class="text-base-content/70 list-inside list-disc text-sm">
				{#each checked.parsed.notes as note (note)}
					<li>{note}</li>
				{/each}
			</ul>
		{/if}
		{#if checked.result.issues.length}
			<BlueprintIssueList issues={checked.result.issues} data={checked.parsed.data} />
		{:else}
			<div role="alert" class="alert alert-success alert-soft py-2 text-sm">
				Keine Probleme gefunden.
			</div>
		{/if}
		{#if blocked}
			<div role="alert" class="alert alert-warning alert-soft py-2 text-sm">
				Unbekannte Module oder doppelte Node-IDs können im Editor nicht angezeigt werden. Bitte im
				JSON korrigieren.
			</div>
		{/if}
	{/if}

	{#snippet actions()}
		<button class="btn btn-ghost" onclick={() => (open = false)}>Abbrechen</button>
		<button class="btn btn-outline" onclick={check} disabled={checking || !text.trim()}>
			{#if checking}<span class="loading loading-spinner loading-xs"></span>{/if}
			Prüfen
		</button>
		{#if isCurrent && counts.errors && !blocked}
			<button
				class="btn btn-warning"
				onclick={() => submit(true)}
				disabled={submitting || needsTitle}
			>
				Trotzdem {mode === 'replace' ? 'übernehmen' : 'erstellen'}
			</button>
		{:else}
			<button
				class="btn btn-primary"
				onclick={() => submit(false)}
				disabled={submitting || checking || blocked || needsTitle || !text.trim()}
			>
				{#if submitting}<span class="loading loading-spinner loading-xs"></span>{/if}
				{mode === 'replace' ? 'Übernehmen' : 'Erstellen'}
			</button>
		{/if}
	{/snippet}
</BlueprintDialog>

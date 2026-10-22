<script lang="ts">
	import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		CreateCustomPlaceDto,
		CustomPlaceApplyResultDto,
		CustomPlaceDto,
		CustomPlaceSuggestionDto
	} from '@bytebunker/backend';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import CustomPlaceDialog from '$lib/components/settings/CustomPlaceDialog.svelte';
	import {
		type CustomPlaceFormValues,
		emptyForm,
		formFromPlace,
		ROLE_BADGES,
		ROLE_LABELS
	} from '$lib/components/settings/customPlaceForm.js';
	import { CustomPlaceApi } from '$lib/api/CustomPlaceApi.js';
	import { formatCoordinates } from '$lib/util/coordinates.js';
	import { toastManager } from '$lib/util/toastManager.svelte.js';
	import LucideMapPin from '~icons/lucide/map-pin';
	import LucidePlus from '~icons/lucide/plus';
	import LucidePencil from '~icons/lucide/pencil';
	import LucideTrash from '~icons/lucide/trash-2';
	import LucidePlay from '~icons/lucide/play';

	const queryClient = useQueryClient();

	const placesQuery = createQuery(() => ({
		queryKey: ['customPlaces'],
		queryFn: () => CustomPlaceApi.findAll()
	}));

	const suggestionsQuery = createQuery(() => ({
		queryKey: ['customPlaces', 'suggestions'],
		queryFn: () => CustomPlaceApi.suggestions(),
		staleTime: 5 * 60 * 1000
	}));

	const saveMutation = createMutation(() => ({
		mutationFn: ({ request, id }: { request: CreateCustomPlaceDto; id?: number }) =>
			id === undefined ? CustomPlaceApi.create(request) : CustomPlaceApi.update(id, request),
		onSuccess: async () => {
			dialogOpen = false;
			toastManager.showSuccess('Ort gespeichert');
			await queryClient.invalidateQueries({ queryKey: ['customPlaces'] });
		},
		onError: (error: Error) => toastManager.showError(`Speichern fehlgeschlagen: ${error.message}`)
	}));

	const deleteMutation = createMutation(() => ({
		mutationFn: (id: number) => CustomPlaceApi.remove(id),
		onSuccess: async () => {
			toastManager.showSuccess('Ort gelöscht');
			await queryClient.invalidateQueries({ queryKey: ['customPlaces'] });
		},
		onError: (error: Error) => toastManager.showError(`Löschen fehlgeschlagen: ${error.message}`)
	}));

	let applyResult = $state<CustomPlaceApplyResultDto>();

	const applyMutation = createMutation(() => ({
		mutationFn: () => CustomPlaceApi.apply(),
		onSuccess: (result: CustomPlaceApplyResultDto) => {
			applyResult = result;
		},
		onError: (error: Error) => toastManager.showError(`Starten fehlgeschlagen: ${error.message}`)
	}));

	let dialogOpen = $state(false);
	let formValues = $state<CustomPlaceFormValues>(emptyForm());

	function openNew() {
		formValues = emptyForm();
		dialogOpen = true;
	}

	function openEdit(place: CustomPlaceDto) {
		formValues = formFromPlace(place);
		dialogOpen = true;
	}

	function adopt(suggestion: CustomPlaceSuggestionDto) {
		formValues = {
			...emptyForm(),
			name: suggestion.nameSource === 'address' ? '' : (suggestion.name ?? ''),
			role: suggestion.inferredRole ?? 'other',
			coordinates: formatCoordinates(suggestion.latitude, suggestion.longitude)
		};
		dialogOpen = true;
	}

	function remove(place: CustomPlaceDto) {
		if (confirm(`„${place.name}“ löschen?`)) {
			deleteMutation.mutate(place.id);
		}
	}

	function validity(place: CustomPlaceDto): string {
		if (!place.validFrom && !place.validTo) {
			return 'immer';
		}

		return `${formatDay(place.validFrom) ?? '…'} – ${formatDay(place.validTo) ?? 'heute'}`;
	}

	function formatDay(day: string | null | undefined): string | undefined {
		return day
			? new Date(`${day}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })
			: undefined;
	}

	const NAME_SOURCES: Record<string, string> = {
		custom: 'eigener Ort',
		osm: 'OpenStreetMap',
		mapbox: 'Mapbox',
		source: 'Quelldaten',
		address: 'Adresse'
	};
</script>

<MainLayout icon={LucideMapPin} title="Eigene Orte" breadcrumbs={[['Einstellungen', '/settings']]}>
	<div class="flex flex-col gap-8 pb-8">
		<p class="text-base-content/70 max-w-3xl text-sm">
			Eigene Orte gehen allen Anbietern (OpenStreetMap, Mapbox, Google) vor: Jeder Ort, dessen
			Mittelpunkt im Radius liegt, bekommt deinen Namen. Zuhause und Arbeit bestimmen außerdem, wann
			du wo gewohnt und gearbeitet hast; mit „Gültig ab/bis“ wird genau dieser Zeitraum übernommen.
		</p>

		<section class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="text-lg font-semibold">Orte</h2>
				<div class="grow"></div>
				<button class="btn btn-sm btn-primary" onclick={openNew}>
					<LucidePlus /> Neuer Ort
				</button>
				<button
					class="btn btn-sm"
					onclick={() => applyMutation.mutate()}
					disabled={applyMutation.isPending}
				>
					{#if applyMutation.isPending}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						<LucidePlay />
					{/if}
					Jetzt anwenden
				</button>
			</div>

			{#if applyResult}
				<div
					class="alert {applyResult.outcome === 'failed' ? 'alert-error' : 'alert-info'} text-sm"
				>
					<span>
						{#if applyResult.outcome === 'started'}
							Ortsanreicherung gestartet.
						{:else if applyResult.outcome === 'skipped'}
							Die Ortsanreicherung läuft bereits.
						{:else}
							Start fehlgeschlagen{applyResult.reason ? `: ${applyResult.reason}` : ''}.
						{/if}
						{#if applyResult.executionId}
							<a class="link" href="/pipelines/{applyResult.executionId}">
								Ausführung #{applyResult.executionId} ansehen
							</a>
						{/if}
					</span>
				</div>
			{:else}
				<p class="text-base-content/60 text-xs">
					Änderungen wirken beim nächsten nächtlichen Lauf der Ortsanreicherung (03:30) oder sofort
					mit „Jetzt anwenden“.
				</p>
			{/if}

			{#if placesQuery.isPending}
				<span class="loading loading-spinner"></span>
			{:else if placesQuery.isError}
				<div class="alert alert-error">Eigene Orte konnten nicht geladen werden.</div>
			{:else if placesQuery.data.length === 0}
				<p class="text-base-content/60 text-sm">
					Noch keine eigenen Orte. Lege einen an oder übernimm einen Vorschlag.
				</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="table-sm table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Art</th>
								<th class="text-right">Radius</th>
								<th>Gültig</th>
								<th>Koordinaten</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each placesQuery.data as place (place.id)}
								<tr class="hover:bg-base-200">
									<td>
										<div class="font-medium">{place.name}</div>
										{#if place.notes}
											<div class="text-base-content/60 max-w-xs truncate text-xs">
												{place.notes}
											</div>
										{/if}
									</td>
									<td>
										<span class="badge badge-sm {ROLE_BADGES[place.role]}">
											{ROLE_LABELS[place.role]}
										</span>
									</td>
									<td class="text-right tabular-nums">{place.radiusMeters} m</td>
									<td class="whitespace-nowrap">{validity(place)}</td>
									<td class="font-mono text-xs">
										<a
											class="link link-hover"
											target="_blank"
											rel="noreferrer"
											href="https://www.google.com/maps/search/?api=1&query={place.latitude},{place.longitude}"
										>
											{formatCoordinates(place.latitude, place.longitude, 5)}
										</a>
									</td>
									<td class="text-right whitespace-nowrap">
										<button
											class="btn btn-ghost btn-xs"
											onclick={() => openEdit(place)}
											aria-label="Bearbeiten"
										>
											<LucidePencil />
										</button>
										<button
											class="btn btn-ghost btn-xs text-error"
											onclick={() => remove(place)}
											aria-label="Löschen"
										>
											<LucideTrash />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-semibold">Vorschläge</h2>
			<p class="text-base-content/60 text-xs">
				Die meistbesuchten Orte, die noch kein eigener Ort abdeckt, mit ihrem aktuellen Namen.
			</p>
			{#if suggestionsQuery.isPending}
				<span class="loading loading-spinner"></span>
			{:else if suggestionsQuery.isError}
				<div class="alert alert-error">Vorschläge konnten nicht geladen werden.</div>
			{:else if suggestionsQuery.data.length === 0}
				<p class="text-base-content/60 text-sm">Keine Vorschläge.</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="table-sm table">
						<thead>
							<tr>
								<th>Aktueller Name</th>
								<th>Ort</th>
								<th class="text-right">Besuche</th>
								<th>Erkannt als</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each suggestionsQuery.data as suggestion (suggestion.id)}
								<tr class="hover:bg-base-200">
									<td>
										<div class="font-medium">{suggestion.name ?? '–'}</div>
										{#if suggestion.nameSource}
											<div class="text-base-content/60 text-xs">
												{NAME_SOURCES[suggestion.nameSource] ?? suggestion.nameSource}
											</div>
										{/if}
									</td>
									<td>{[suggestion.city, suggestion.country].filter(Boolean).join(', ')}</td>
									<td class="text-right tabular-nums">{suggestion.visitCount}</td>
									<td>
										{#if suggestion.inferredRole}
											<span class="badge badge-sm {ROLE_BADGES[suggestion.inferredRole]}">
												{ROLE_LABELS[suggestion.inferredRole]}
											</span>
										{/if}
									</td>
									<td class="text-right">
										<button class="btn btn-xs" onclick={() => adopt(suggestion)}>Übernehmen</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</div>
</MainLayout>

<CustomPlaceDialog
	bind:open={dialogOpen}
	bind:values={formValues}
	saving={saveMutation.isPending}
	onsave={(request, id) => saveMutation.mutate({ request, id })}
/>

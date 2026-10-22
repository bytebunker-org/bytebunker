<script lang="ts">
	import BlueprintDialog from '$lib/components/pipeline/validation/BlueprintDialog.svelte';
	import { MapboxApi } from '$lib/api/MapboxApi.js';
	import { formatCoordinates, parseCoordinates } from '$lib/util/coordinates.js';
	import {
		clampRadius,
		type CustomPlaceFormValues,
		MAX_RADIUS_METERS,
		MIN_RADIUS_METERS,
		ROLE_LABELS,
		toRequest
	} from './customPlaceForm.js';
	import type { CreateCustomPlaceDto } from '@bytebunker/backend';

	interface Props {
		open: boolean;
		values: CustomPlaceFormValues;
		saving?: boolean;
		onsave: (request: CreateCustomPlaceDto, id: number | undefined) => void;
	}

	let { open = $bindable(), values = $bindable(), saving = false, onsave }: Props = $props();

	let error = $state<string>();

	const FORMAT_LABELS = {
		pair: 'Koordinaten',
		'google-maps': 'Google-Maps-Link',
		'geo-uri': 'geo:-URI'
	} as const;

	let parsed = $derived(parseCoordinates(values.coordinates));

	// The preview follows the inputs with a short delay, so dragging the slider does not load dozens of images.
	let preview = $state<{ lat: number; lng: number; radiusMeters: number }>();

	$effect(() => {
		const next = parsed
			? { lat: parsed.lat, lng: parsed.lng, radiusMeters: clampRadius(values.radiusMeters) }
			: undefined;
		const timeout = setTimeout(() => (preview = next), 350);

		return () => clearTimeout(timeout);
	});

	let previewUrl = $derived(
		preview ? MapboxApi.buildCircleImageUrl({ ...preview, width: 560, height: 280 }) : undefined
	);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const request = toRequest(values);

		if (typeof request === 'string') {
			error = request;

			return;
		}

		error = undefined;
		onsave(request, values.id);
	}
</script>

<BlueprintDialog bind:open title={values.id ? 'Ort bearbeiten' : 'Neuer Ort'}>
	<form id="custom-place-form" class="flex flex-col gap-3" onsubmit={submit}>
		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium">Name</span>
			<input class="input w-full" bind:value={values.name} required maxlength="255" />
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium">Art</span>
			<select class="select w-full" bind:value={values.role}>
				{#each Object.entries(ROLE_LABELS) as [value, label] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium">Koordinaten</span>
			<input
				class="input w-full font-mono"
				bind:value={values.coordinates}
				placeholder="53.5511, 9.9937 · Google-Maps-Link · geo:53.5511,9.9937"
			/>
			<span class="text-xs {parsed || !values.coordinates ? 'text-base-content/60' : 'text-error'}">
				{#if parsed}
					Erkannt ({FORMAT_LABELS[parsed.format]}): {formatCoordinates(parsed.lat, parsed.lng)}
				{:else if values.coordinates}
					Nicht erkannt. Erwartet „Breite, Länge“, einen Google-Maps-Link oder eine geo:-URI.
				{:else}
					„Breite, Länge“, ein Google-Maps-Link (mit @Breite,Länge oder ?q=) oder eine geo:-URI.
				{/if}
			</span>
		</label>

		<div class="flex flex-col gap-1">
			<span class="text-sm font-medium">Radius</span>
			<div class="flex items-center gap-3">
				<input
					type="range"
					class="range range-sm flex-1"
					min={MIN_RADIUS_METERS}
					max={500}
					step="5"
					bind:value={values.radiusMeters}
					aria-label="Radius"
				/>
				<label class="input input-sm w-32">
					<input
						type="number"
						min={MIN_RADIUS_METERS}
						max={MAX_RADIUS_METERS}
						bind:value={values.radiusMeters}
						onchange={() => (values.radiusMeters = clampRadius(values.radiusMeters))}
					/>
					m
				</label>
			</div>
			<span class="text-base-content/60 text-xs">
				Alle Orte, deren Mittelpunkt in diesem Radius liegt, bekommen diesen Namen.
			</span>
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium">Gültig ab (optional)</span>
				<input type="date" class="input w-full" bind:value={values.validFrom} />
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium">Gültig bis (optional)</span>
				<input type="date" class="input w-full" bind:value={values.validTo} />
			</label>
		</div>
		{#if values.role !== 'other' && (values.validFrom || values.validTo)}
			<span class="text-base-content/60 -mt-2 text-xs">
				Dieser Zeitraum gilt als {ROLE_LABELS[values.role]}, auch wenn es wenige Besuche gibt.
			</span>
		{/if}

		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium">Notizen (optional)</span>
			<textarea class="textarea w-full" rows="2" bind:value={values.notes} maxlength="2000"
			></textarea>
		</label>

		{#if previewUrl}
			<img
				src={previewUrl}
				alt="Kartenvorschau"
				class="border-base-300 aspect-[2/1] w-full rounded-lg border object-cover"
			/>
		{/if}

		{#if error}
			<div class="alert alert-error text-sm">{error}</div>
		{/if}
	</form>

	{#snippet actions()}
		<button class="btn" type="button" onclick={() => (open = false)}>Abbrechen</button>
		<button class="btn btn-primary" type="submit" form="custom-place-form" disabled={saving}>
			{#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
			Speichern
		</button>
	{/snippet}
</BlueprintDialog>

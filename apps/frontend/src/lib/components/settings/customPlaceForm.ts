import type {
	CreateCustomPlaceDto,
	CustomPlaceDto,
	CustomPlaceRoleEnum
} from '@bytebunker/backend';
import { formatCoordinates, parseCoordinates } from '$lib/util/coordinates.js';

export const DEFAULT_RADIUS_METERS = 75;
export const MIN_RADIUS_METERS = 10;
export const MAX_RADIUS_METERS = 2000;

export const ROLE_LABELS: Record<`${CustomPlaceRoleEnum}`, string> = {
	home: 'Zuhause',
	work: 'Arbeit',
	other: 'Sonstiges'
};

export const ROLE_BADGES: Record<`${CustomPlaceRoleEnum}`, string> = {
	home: 'badge-primary',
	work: 'badge-secondary',
	other: 'badge-ghost'
};

/** The values of the add/edit dialog; strings as the inputs hold them. */
export interface CustomPlaceFormValues {
	id?: number;
	name: string;
	role: `${CustomPlaceRoleEnum}`;
	coordinates: string;
	radiusMeters: number;
	validFrom: string;
	validTo: string;
	notes: string;
}

export function emptyForm(): CustomPlaceFormValues {
	return {
		name: '',
		role: 'other',
		coordinates: '',
		radiusMeters: DEFAULT_RADIUS_METERS,
		validFrom: '',
		validTo: '',
		notes: ''
	};
}

export function formFromPlace(place: CustomPlaceDto): CustomPlaceFormValues {
	return {
		id: place.id,
		name: place.name,
		role: place.role,
		coordinates: formatCoordinates(place.latitude, place.longitude),
		radiusMeters: place.radiusMeters,
		validFrom: place.validFrom ?? '',
		validTo: place.validTo ?? '',
		notes: place.notes ?? ''
	};
}

export function clampRadius(value: number): number {
	if (!Number.isFinite(value)) {
		return DEFAULT_RADIUS_METERS;
	}

	return Math.min(MAX_RADIUS_METERS, Math.max(MIN_RADIUS_METERS, Math.round(value)));
}

/** The request body, or a German error message explaining what is missing. */
export function toRequest(values: CustomPlaceFormValues): CreateCustomPlaceDto | string {
	const name = values.name.trim();

	if (!name) {
		return 'Bitte einen Namen angeben.';
	}

	const coordinates = parseCoordinates(values.coordinates);

	if (!coordinates) {
		return 'Koordinaten nicht erkannt.';
	}

	if (values.validFrom && values.validTo && values.validFrom > values.validTo) {
		return '„Gültig ab“ liegt nach „Gültig bis“.';
	}

	return {
		name,
		role: values.role as CustomPlaceRoleEnum,
		latitude: coordinates.lat,
		longitude: coordinates.lng,
		radiusMeters: clampRadius(values.radiusMeters),
		validFrom: values.validFrom || null,
		validTo: values.validTo || null,
		notes: values.notes.trim() || null
	};
}

import { ApiBase } from '$lib/api/ApiBase.js';
import type {
	CreateCustomPlaceDto,
	CustomPlaceApplyResultDto,
	CustomPlaceDto,
	CustomPlaceSuggestionDto,
	UpdateCustomPlaceDto
} from '@bytebunker/backend';

export class CustomPlaceApi extends ApiBase {
	public static findAll(fetchImpl?: typeof fetch): Promise<CustomPlaceDto[]> {
		return ApiBase.get(fetchImpl, '/custom-places');
	}

	public static suggestions(fetchImpl?: typeof fetch): Promise<CustomPlaceSuggestionDto[]> {
		return ApiBase.get(fetchImpl, '/custom-places/suggestions');
	}

	public static create(
		data: CreateCustomPlaceDto,
		fetchImpl?: typeof fetch
	): Promise<CustomPlaceDto> {
		return ApiBase.post(fetchImpl, '/custom-places', data);
	}

	public static update(
		id: number,
		data: UpdateCustomPlaceDto,
		fetchImpl?: typeof fetch
	): Promise<CustomPlaceDto> {
		return ApiBase.patch(fetchImpl, `/custom-places/${id}`, data);
	}

	public static remove(id: number, fetchImpl?: typeof fetch): Promise<void> {
		return ApiBase.del(fetchImpl, `/custom-places/${id}`);
	}

	/** Runs the place enrichment blueprint now. */
	public static apply(fetchImpl?: typeof fetch): Promise<CustomPlaceApplyResultDto> {
		return ApiBase.post(fetchImpl, '/custom-places/apply');
	}
}

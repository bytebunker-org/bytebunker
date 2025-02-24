import { ApiBase } from '$lib/api/ApiBase.js';
import type {
	ActivityGraphSearchRequestDto,
	ActivityGraphSearchResponseDto,
	ActivityGraphSearchCountRequestDto,
	ActivityGraphSearchCountResponseDto
} from '@bytebunker/backend';

export class ActivityGraphSearchApi extends ApiBase {
	public static search(
		params: ActivityGraphSearchRequestDto,
		fetchImpl?: typeof fetch
	): Promise<ActivityGraphSearchResponseDto> {
		return ApiBase.get(fetchImpl, '/activities/search', { params });
	}

	public static count(
		params: ActivityGraphSearchCountRequestDto,
		fetchImpl?: typeof fetch
	): Promise<ActivityGraphSearchCountResponseDto> {
		return ApiBase.get(fetchImpl, '/activities/search/count', { params });
	}
}

import { ApiBase } from '$lib/api/ApiBase.js';
import type { CoverageGroupBy, CoverageResponseDto } from '@bytebunker/backend';

export interface CoverageParams {
	from?: string;
	to?: string;
	groupBy?: CoverageGroupBy;
	minGapDays?: number;
}

export class CoverageApi extends ApiBase {
	public static load(
		params: CoverageParams,
		fetchImpl?: typeof fetch
	): Promise<CoverageResponseDto> {
		return ApiBase.get(fetchImpl, '/activities/coverage', { params });
	}
}

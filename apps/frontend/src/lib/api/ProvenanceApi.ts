import { ApiBase } from '$lib/api/ApiBase.js';
import type { ImportProvenanceSummaryDto } from '@bytebunker/backend';

export class ProvenanceApi extends ApiBase {
	public static byExecution(
		executionId: number,
		fetchImpl?: typeof fetch
	): Promise<ImportProvenanceSummaryDto> {
		return ApiBase.get(fetchImpl, '/activities/provenance', { params: { executionId } });
	}
}

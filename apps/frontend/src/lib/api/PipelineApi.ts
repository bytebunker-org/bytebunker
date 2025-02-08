import { ApiBase } from '$lib/api/ApiBase.js';
import type {
	FindAllDto,
	FindRestApiCountDto,
	PaginatedListRequestDto,
	PaginatedListResponseDto,
	PipelineBlueprintDto,
	FindOneDto,
	PipelineExecutionDatatableDto,
	PipelineExecutionDto,
	FindRestApiCountResponseDto
} from '@bytebunker/backend';

export class PipelineApi extends ApiBase {
	public static findAllDatatable(
		params: PaginatedListRequestDto<PipelineExecutionDatatableDto>,
		fetchImpl?: typeof fetch
	): Promise<PaginatedListResponseDto<PipelineExecutionDatatableDto>> {
		return ApiBase.get(fetchImpl, '/pipelines/datatable-entries', { params });
	}

	public static findAll(
		params: FindAllDto<PipelineBlueprintDto>,
		fetchImpl?: typeof fetch
	): Promise<PipelineBlueprintDto[]> {
		return ApiBase.get(fetchImpl, '/pipelines', { params });
	}

	public static count(
		params: FindRestApiCountDto<PipelineExecutionDto>,
		fetchImpl?: typeof fetch
	): Promise<FindRestApiCountResponseDto> {
		return ApiBase.get(fetchImpl, '/pipelines/count', { params });
	}

	public static findOne(
		id: number,
		params: FindOneDto<PipelineExecutionDto>,
		fetchImpl?: typeof fetch
	): Promise<PipelineExecutionDto> {
		return ApiBase.get(fetchImpl, `/pipelines/${id}`, { params });
	}
}

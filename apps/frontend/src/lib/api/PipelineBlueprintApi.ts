import { ApiBase } from '$lib/api/ApiBase.js';
import type {
	CreatePipelineBlueprintDto,
	FindAllDto,
	FindRestApiCountDto,
	PaginatedListRequestDto,
	PaginatedListResponseDto,
	PipelineBlueprintDatatableDto,
	PipelineBlueprintDto,
	UpdatePipelineBlueprintDto,
	FindOneDto
} from '@bytebunker/backend';

export class PipelineBlueprintApi extends ApiBase {
	public static create(
		data: CreatePipelineBlueprintDto,
		fetchImpl?: typeof fetch
	): Promise<PipelineBlueprintDto> {
		return ApiBase.post(fetchImpl, '/pipelines-blueprints', data);
	}

	public static findAllDatatable(
		params: PaginatedListRequestDto<PipelineBlueprintDatatableDto>,
		fetchImpl?: typeof fetch
	): Promise<PaginatedListResponseDto<PipelineBlueprintDatatableDto>> {
		return ApiBase.get(fetchImpl, '/pipelines-blueprints/datatable-entries', { params });
	}

	public static findAll(
		params: FindAllDto<PipelineBlueprintDto>,
		fetchImpl?: typeof fetch
	): Promise<PipelineBlueprintDto[]> {
		return ApiBase.get(fetchImpl, '/pipelines-blueprints', { params });
	}

	public static count(
		params: FindRestApiCountDto<PipelineBlueprintDto>,
		fetchImpl?: typeof fetch
	): Promise<PipelineBlueprintDto[]> {
		return ApiBase.get(fetchImpl, '/pipelines-blueprints/count', { params });
	}

	public static findOne(
		id: number,
		params: FindOneDto<PipelineBlueprintDto>,
		fetchImpl?: typeof fetch
	): Promise<PipelineBlueprintDto> {
		return ApiBase.get(fetchImpl, `/pipelines-blueprints/${id}`, { params });
	}

	public static update(
		id: number,
		data: UpdatePipelineBlueprintDto,
		fetchImpl?: typeof fetch
	): Promise<PipelineBlueprintDto> {
		return ApiBase.patch(fetchImpl, `/pipelines-blueprints/${id}`, data);
	}

	public static remove(id: number, fetchImpl?: typeof fetch): Promise<void> {
		return ApiBase.del(fetchImpl, `/pipelines-blueprints/${id}`);
	}
}

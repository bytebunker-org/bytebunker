import { ApiBase } from '$lib/api/ApiBase.js';
import type {
	FindAllDto,
	FindRestApiCountDto,
	FindOneDto,
	PipelineModuleDto
} from '@bytebunker/backend';

export class PipelineModuleApi extends ApiBase {
	public static findAll(
		params: FindAllDto<PipelineModuleDto>,
		fetchImpl?: typeof fetch
	): Promise<PipelineModuleDto[]> {
		return ApiBase.get(fetchImpl, '/pipelines-modules', { params });
	}

	public static count(
		params: FindRestApiCountDto<PipelineModuleDto>,
		fetchImpl?: typeof fetch
	): Promise<PipelineModuleDto> {
		return ApiBase.get(fetchImpl, '/pipelines-modules/count', { params });
	}

	public static findOne(
		id: number,
		params: FindOneDto<PipelineModuleDto>,
		fetchImpl?: typeof fetch
	): Promise<PipelineModuleDto> {
		return ApiBase.get(fetchImpl, `/pipelines-modules/${id}`, { params });
	}
}

import { ApiBase } from '$lib/api/ApiBase.js';
import type {
	FindAllDto,
	FindOneDto,
	FindRestApiCountDto,
	FindRestApiCountResponseDto,
	PipelineExecutionLogDto
} from '@bytebunker/backend';

export class PipelineExecutionLogApi extends ApiBase {
	public static findAll(
		pipelineId: number,
		params: FindAllDto<PipelineExecutionLogDto>,
		fetchImpl?: typeof fetch
	): Promise<PipelineExecutionLogDto[]> {
		return ApiBase.get(fetchImpl, `/pipelines/${pipelineId}/logs`, { params });
	}

	public static count(
		pipelineId: number,
		params: FindRestApiCountDto<PipelineExecutionLogDto>,
		fetchImpl?: typeof fetch
	): Promise<FindRestApiCountResponseDto> {
		return ApiBase.get(fetchImpl, `/pipelines/${pipelineId}/logs/count`, { params });
	}

	public static findOne(
		pipelineId: number,
		id: number,
		params: FindOneDto<PipelineExecutionLogDto>,
		fetchImpl?: typeof fetch
	): Promise<PipelineExecutionLogDto> {
		return ApiBase.get(fetchImpl, `/pipelines/${pipelineId}/logs/${id}`, { params });
	}
}

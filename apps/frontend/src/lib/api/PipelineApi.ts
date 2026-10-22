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
	FindRestApiCountResponseDto,
	PipelineProgressDto,
	PipelineExecutionDataDto
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
		params: FindOneDto<PipelineExecutionDto, any, any, any>,
		fetchImpl?: typeof fetch
	): Promise<PipelineExecutionDto> {
		return ApiBase.get(fetchImpl, `/pipelines/${id}`, { params });
	}

	public static scheduleExecution(id: number, fetchImpl?: typeof fetch): Promise<void> {
		return ApiBase.post(fetchImpl, `/pipelines/${id}/schedule-execution`);
	}

	/** Runs a dry-run execution for real. */
	public static applyDryRun(id: number, fetchImpl?: typeof fetch): Promise<PipelineExecutionDto> {
		return ApiBase.post(fetchImpl, `/pipelines/${id}/apply`);
	}

	/** Previews an execution again as a dry run. */
	public static dryRun(id: number, fetchImpl?: typeof fetch): Promise<PipelineExecutionDto> {
		return ApiBase.post(fetchImpl, `/pipelines/${id}/dry-run`);
	}

	/** Re-runs one failed node and everything after it. */
	public static retryNode(id: number, nodeId: number, fetchImpl?: typeof fetch): Promise<void> {
		return ApiBase.post(fetchImpl, `/pipelines/${id}/nodes/${nodeId}/retry`);
	}

	public static getProgress(id: number, fetchImpl?: typeof fetch): Promise<PipelineProgressDto> {
		return ApiBase.get(fetchImpl, `/pipelines/${id}/progress`);
	}

	/** Path of the server-sent-events stream, relative to the API base URL. */
	public static progressStreamPath(id: number): string {
		return `/pipelines/${id}/progress/stream`;
	}

	/**
	 * Loads the output of a single node. Selects only that node's execution data row instead of
	 * the whole execution, because imports store tens of megabytes per node.
	 */
	public static async findNodeData(
		id: number,
		nodeId: number,
		fetchImpl?: typeof fetch
	): Promise<PipelineExecutionDataDto | undefined> {
		const execution = await ApiBase.get<PipelineExecutionDto>(fetchImpl, `/pipelines/${id}`, {
			params: {
				populate: ['executionData'],
				populateWhere: { executionData: { nodeId } },
				fields: [
					'id',
					'executionData.nodeId',
					'executionData.executionStatus',
					'executionData.data'
				]
			}
		});

		return execution.executionData?.find((d) => d.nodeId === nodeId);
	}
}

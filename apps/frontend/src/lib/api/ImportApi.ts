import { ApiBase } from '$lib/api/ApiBase.js';
import { ApiError } from '$lib/api/ApiError.js';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type {
	FileImportBatchResultDto,
	PipelineExecutionDto,
	PipelineProgressDto
} from '@bytebunker/backend';

export interface ImportUploadEntry {
	file: File;
	/** Relative path inside the dropped folder / archive, with `/` separators. */
	path: string;
}

export interface ImportUploadOptions {
	dryRun: boolean;
	allowReimport: boolean;
	blueprintIds?: number[];
	onProgress?: (loaded: number, total: number) => void;
	signal?: AbortSignal;
}

export class ImportApi extends ApiBase {
	/**
	 * Uploads files as multipart/form-data. Uses XMLHttpRequest because fetch has no upload progress.
	 */
	public static upload(
		entries: ImportUploadEntry[],
		options: ImportUploadOptions
	): Promise<FileImportBatchResultDto> {
		const form = new FormData();
		// Text fields first so the server sees them before the (large) file parts
		form.append('paths', JSON.stringify(entries.map((entry) => entry.path)));
		form.append('dryRun', String(options.dryRun));
		form.append('allowReimport', String(options.allowReimport));
		if (options.blueprintIds?.length) {
			form.append('blueprintIds', options.blueprintIds.join(','));
		}
		for (const { file } of entries) {
			form.append('files', file, file.name);
		}

		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', PUBLIC_API_BASE_URL + '/imports');
			xhr.withCredentials = true;
			xhr.setRequestHeader('Accept', 'application/json');
			xhr.upload.onprogress = (event) => {
				if (event.lengthComputable) {
					options.onProgress?.(event.loaded, event.total);
				}
			};
			xhr.onload = () => {
				let body: { message?: string } = {};
				try {
					body = JSON.parse(xhr.responseText) as { message?: string };
				} catch {
					/* empty */
				}
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve(body as FileImportBatchResultDto);
				} else {
					reject(new ApiError(body.message ?? 'Upload fehlgeschlagen', xhr.status));
				}
			};
			xhr.onerror = () => reject(new ApiError('Netzwerkfehler beim Upload', 0));
			xhr.onabort = () => reject(new ApiError('Upload abgebrochen', 0));
			options.signal?.addEventListener('abort', () => xhr.abort());
			xhr.send(form);
		});
	}

	public static progress(
		executionId: number,
		fetchImpl?: typeof fetch
	): Promise<PipelineProgressDto> {
		return ApiBase.get(fetchImpl, `/pipelines/${executionId}/progress`);
	}

	public static apply(
		executionId: number,
		fetchImpl?: typeof fetch
	): Promise<PipelineExecutionDto> {
		return ApiBase.post(fetchImpl, `/pipelines/${executionId}/apply`);
	}
}

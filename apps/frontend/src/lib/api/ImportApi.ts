import { ApiBase } from '$lib/api/ApiBase.js';
import { ApiError } from '$lib/api/ApiError.js';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type {
	FileImportBatchResultDto,
	FileImportPreviewBatchDto,
	PipelineExecutionDto,
	PipelineProgressDto
} from '@bytebunker/backend';

export interface ImportUploadEntry {
	/** A dropped `File`, or the extracted content of a zip entry. */
	file: Blob;
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
		for (const { file, path } of entries) {
			form.append('files', file, path.split('/').pop() || 'file');
		}

		return ImportApi.sendForm<FileImportBatchResultDto>('/imports', form, options);
	}

	/**
	 * Asks the server how it would route each file, from the files' first bytes (`heads`, at most
	 * FILE_SAMPLE_HEAD_BYTES each). Nothing is stored.
	 */
	public static preview(
		files: { path: string; size: number; head: Blob }[],
		options: { blueprintIds?: number[]; signal?: AbortSignal } = {}
	): Promise<FileImportPreviewBatchDto> {
		const form = new FormData();
		form.append('paths', JSON.stringify(files.map((file) => file.path)));
		form.append('sizes', JSON.stringify(files.map((file) => file.size)));
		if (options.blueprintIds?.length) {
			form.append('blueprintIds', options.blueprintIds.join(','));
		}
		for (const file of files) {
			form.append('files', file.head, file.path.split('/').pop() || 'file');
		}

		return ImportApi.sendForm<FileImportPreviewBatchDto>('/imports/preview', form, options);
	}

	private static sendForm<T>(
		path: string,
		form: FormData,
		options: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal }
	): Promise<T> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', PUBLIC_API_BASE_URL + path);
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
					resolve(body as T);
				} else {
					reject(new ApiError(body.message ?? 'Upload fehlgeschlagen', xhr.status));
				}
			};
			xhr.onerror = () => reject(new ApiError('Netzwerkfehler beim Upload', 0));
			xhr.onabort = () => reject(new ApiError('Upload abgebrochen', 0));
			if (options.signal?.aborted) {
				reject(new ApiError('Upload abgebrochen', 0));
				return;
			}
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

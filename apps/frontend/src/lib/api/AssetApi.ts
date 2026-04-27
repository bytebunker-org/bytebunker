import { ApiBase } from '$lib/api/ApiBase.js';
import { ApiError } from '$lib/api/ApiError.js';
import type { AssetDto, AssetTypeEnum } from '@bytebunker/backend';
import { PUBLIC_API_BASE_URL } from '$env/static/public';

export interface UploadAssetOptions {
	type?: AssetTypeEnum;
	metadata?: Record<string, unknown>;
}

export class AssetApi extends ApiBase {
	public static async upload(
		file: File,
		options: UploadAssetOptions = {},
		fetchImpl: typeof fetch = fetch
	): Promise<AssetDto> {
		const formData = new FormData();
		formData.append('file', file);
		if (options.type) {
			formData.append('type', options.type);
		}
		if (options.metadata) {
			formData.append('metadata', JSON.stringify(options.metadata));
		}

		const isCredentialsSupported = 'credentials' in Request.prototype;

		const response = await fetchImpl(`${PUBLIC_API_BASE_URL}/assets`, {
			method: 'POST',
			body: formData,
			...(isCredentialsSupported ? { credentials: 'include' } : {}),
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			let responseData: { message?: string } = {};
			try {
				responseData = (await response.json()) as { message?: string };
			} catch {
				/* empty */
			}
			throw new ApiError(responseData.message ?? 'Failed to upload asset', response.status);
		}

		return (await response.json()) as AssetDto;
	}

	public static getInfo(id: string, fetchImpl?: typeof fetch): Promise<AssetDto> {
		return ApiBase.get(fetchImpl, `/assets/${id}/info`);
	}

	public static remove(id: string, fetchImpl?: typeof fetch): Promise<void> {
		return ApiBase.del(fetchImpl, `/assets/${id}`);
	}
}

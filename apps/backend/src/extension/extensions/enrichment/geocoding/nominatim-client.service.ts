import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../../util/config/app.config.js';
import { DEFAULT_NOMINATIM_BASE_URL } from './geocoding.constant.js';
import { NominatimClient } from './nominatim-client.js';

/** One {@link NominatimClient} per process, so every run shares its rate limit. */
@Injectable()
export class NominatimClientService {
    public readonly client: NominatimClient;
    public readonly baseUrl: string;

    constructor(appConfig: AppConfig) {
        this.baseUrl = appConfig.geocoding?.nominatimBaseUrl ?? DEFAULT_NOMINATIM_BASE_URL;
        this.client = new NominatimClient({
            baseUrl: this.baseUrl,
            minIntervalMs: appConfig.geocoding?.nominatimMinIntervalMs,
        });
    }
}

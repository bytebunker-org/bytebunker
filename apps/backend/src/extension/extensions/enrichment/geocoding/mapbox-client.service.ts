import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../../util/config/app.config.js';
import { DEFAULT_MAPBOX_BASE_URL } from '../util/mapbox.util.js';
import { DEFAULT_MAPBOX_MIN_INTERVAL_MS } from './geocoding.constant.js';
import { MapboxClient } from './mapbox-client.js';

/** One {@link MapboxClient} per process (shared rate limit); undefined without an access token. */
@Injectable()
export class MapboxClientService {
    public readonly client: MapboxClient | undefined;

    constructor(appConfig: AppConfig) {
        const accessToken = appConfig.geocoding?.mapboxAccessToken;

        this.client = accessToken
            ? new MapboxClient({
                  baseUrl: appConfig.geocoding?.mapboxBaseUrl ?? DEFAULT_MAPBOX_BASE_URL,
                  accessToken,
                  minIntervalMs: appConfig.geocoding?.mapboxMinIntervalMs ?? DEFAULT_MAPBOX_MIN_INTERVAL_MS,
              })
            : undefined;
    }
}

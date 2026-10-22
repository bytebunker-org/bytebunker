import {
    buildMapboxReverseUrl,
    mapMapboxReverse,
    type MapboxPlaceDetails,
    type MapboxReverseResponse,
} from '../util/mapbox.util.js';
import {
    backoffDelayMs,
    type BackoffOptions,
    type Clock,
    isRetryableStatus,
    parseRetryAfterMs,
    RateLimiter,
    SYSTEM_CLOCK,
} from '../util/rate-limit.util.js';

export type MapboxReverseResult =
    | { ok: true; details: MapboxPlaceDetails; attempts: number }
    | { ok: false; error: string; attempts: number };

export interface MapboxClientOptions {
    baseUrl: string;
    accessToken: string;
    minIntervalMs: number;
    maxRetries?: number;
    backoff?: BackoffOptions;
    timeoutMs?: number;
    fetch?: typeof fetch;
    clock?: Clock;
}

/** Mapbox temporary reverse geocoding: rate limited, retries with backoff on 429, 5xx and network errors. */
export class MapboxClient {
    private readonly limiter: RateLimiter;
    private readonly maxRetries: number;
    private readonly backoff: BackoffOptions;
    private readonly timeoutMs: number;
    private readonly fetchFn: typeof fetch;
    private readonly clock: Clock;

    constructor(private readonly options: MapboxClientOptions) {
        this.clock = options.clock ?? SYSTEM_CLOCK;
        this.limiter = new RateLimiter(options.minIntervalMs, this.clock);
        this.maxRetries = options.maxRetries ?? 4;
        this.backoff = options.backoff ?? { baseDelayMs: 2000, maxDelayMs: 60_000 };
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.fetchFn = options.fetch ?? fetch;
    }

    public get minIntervalMs(): number {
        return this.options.minIntervalMs;
    }

    public async reverse(
        point: { latitude: number; longitude: number },
        language: string,
    ): Promise<MapboxReverseResult> {
        const url = buildMapboxReverseUrl(this.options.baseUrl, this.options.accessToken, point, language);
        let lastError = '';

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            await this.limiter.acquire();
            let retryAfterMs: number | undefined;

            try {
                const response = await this.fetchFn(url, {
                    headers: { Accept: 'application/json' },
                    signal: AbortSignal.timeout(this.timeoutMs),
                });

                if (response.ok) {
                    const body = (await response.json()) as MapboxReverseResponse;

                    return { ok: true, details: mapMapboxReverse(body), attempts: attempt + 1 };
                }

                // Never log the URL: it carries the access token.
                lastError = `HTTP ${response.status} ${response.statusText}`.trim();

                if (!isRetryableStatus(response.status)) {
                    return { ok: false, error: lastError, attempts: attempt + 1 };
                }

                retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'), this.clock.now());
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }

            if (attempt < this.maxRetries) {
                this.limiter.delayUntil(this.clock.now() + backoffDelayMs(attempt, this.backoff, retryAfterMs));
            }
        }

        return { ok: false, error: lastError, attempts: this.maxRetries + 1 };
    }
}

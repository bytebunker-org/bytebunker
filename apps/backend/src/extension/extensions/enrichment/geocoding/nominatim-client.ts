import {
    buildNominatimReverseUrl,
    mapNominatimReverse,
    type NominatimReverseResponse,
    type OsmPlaceDetails,
} from '../util/nominatim.util.js';
import {
    backoffDelayMs,
    type BackoffOptions,
    type Clock,
    isRetryableStatus,
    parseRetryAfterMs,
    RateLimiter,
    SYSTEM_CLOCK,
} from '../util/rate-limit.util.js';
import { NOMINATIM_USER_AGENT, PUBLIC_NOMINATIM_HOST, PUBLIC_NOMINATIM_MIN_INTERVAL_MS } from './geocoding.constant.js';

export type ReverseGeocodeResult =
    | { ok: true; details: OsmPlaceDetails; attempts: number }
    | { ok: false; error: string; attempts: number };

export interface NominatimClientOptions {
    baseUrl: string;
    /** Requested spacing between requests; see {@link effectiveMinIntervalMs}. */
    minIntervalMs?: number;
    /** Retries after the first attempt for 429, 5xx and network errors. Default 4. */
    maxRetries?: number;
    backoff?: BackoffOptions;
    /** Per-request timeout. Default 30 s. */
    timeoutMs?: number;
    fetch?: typeof fetch;
    clock?: Clock;
}

/** Never faster than one request per second against the public instance; self-hosted instances may go faster. */
export function effectiveMinIntervalMs(baseUrl: string, requested: number | undefined): number {
    const interval = requested ?? PUBLIC_NOMINATIM_MIN_INTERVAL_MS;
    let host = '';

    try {
        host = new URL(baseUrl).hostname.toLowerCase();
    } catch {
        // An invalid URL fails on the first request; until then treat it as the public host.
        host = PUBLIC_NOMINATIM_HOST;
    }

    return host === PUBLIC_NOMINATIM_HOST || host.endsWith(`.${PUBLIC_NOMINATIM_HOST}`)
        ? Math.max(PUBLIC_NOMINATIM_MIN_INTERVAL_MS, interval)
        : Math.max(0, interval);
}

/**
 * Reverse geocoding against a Nominatim instance: rate limited (shared by all callers of this client), identifying
 * User-Agent, retries with exponential backoff on 429, 5xx and network errors.
 */
export class NominatimClient {
    public readonly minIntervalMs: number;
    private readonly limiter: RateLimiter;
    private readonly maxRetries: number;
    private readonly backoff: BackoffOptions;
    private readonly timeoutMs: number;
    private readonly fetchFn: typeof fetch;
    private readonly clock: Clock;

    constructor(private readonly options: NominatimClientOptions) {
        this.clock = options.clock ?? SYSTEM_CLOCK;
        this.minIntervalMs = effectiveMinIntervalMs(options.baseUrl, options.minIntervalMs);
        this.limiter = new RateLimiter(this.minIntervalMs, this.clock);
        this.maxRetries = options.maxRetries ?? 4;
        this.backoff = options.backoff ?? { baseDelayMs: 2000, maxDelayMs: 60_000 };
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.fetchFn = options.fetch ?? fetch;
    }

    public async reverse(
        point: { latitude: number; longitude: number },
        acceptLanguage: string,
    ): Promise<ReverseGeocodeResult> {
        const url = buildNominatimReverseUrl(this.options.baseUrl, point, acceptLanguage);
        let lastError = '';

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            await this.limiter.acquire();
            let retryAfterMs: number | undefined;

            try {
                const response = await this.fetchFn(url, {
                    headers: {
                        'User-Agent': NOMINATIM_USER_AGENT,
                        Accept: 'application/json',
                        ...(acceptLanguage ? { 'Accept-Language': acceptLanguage } : {}),
                    },
                    signal: AbortSignal.timeout(this.timeoutMs),
                });

                if (response.ok) {
                    const body = (await response.json()) as NominatimReverseResponse;

                    return { ok: true, details: mapNominatimReverse(body), attempts: attempt + 1 };
                }

                lastError = `HTTP ${response.status} ${response.statusText}`.trim();

                if (!isRetryableStatus(response.status)) {
                    return { ok: false, error: lastError, attempts: attempt + 1 };
                }

                retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'), this.clock.now());
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }

            if (attempt < this.maxRetries) {
                const delay = backoffDelayMs(attempt, this.backoff, retryAfterMs);
                // Holds back every caller of this client, not just this request.
                this.limiter.delayUntil(this.clock.now() + delay);
            }
        }

        return { ok: false, error: lastError, attempts: this.maxRetries + 1 };
    }
}

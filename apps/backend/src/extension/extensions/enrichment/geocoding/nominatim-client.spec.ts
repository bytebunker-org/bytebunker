import { describe, expect, it } from 'vitest';
import {
    backoffDelayMs,
    type Clock,
    isRetryableStatus,
    parseRetryAfterMs,
    RateLimiter,
} from '../util/rate-limit.util.js';
import { effectiveMinIntervalMs, NominatimClient } from './nominatim-client.js';
import { NOMINATIM_USER_AGENT } from './geocoding.constant.js';

/** Time only moves when someone sleeps. */
function fakeClock(): Clock & { sleeps: number[] } {
    let now = 1_000_000;
    const sleeps: number[] = [];

    return {
        sleeps,
        now: () => now,
        sleep: (ms) => {
            sleeps.push(ms);
            now += ms;

            return Promise.resolve();
        },
    };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const OK_BODY = {
    osm_type: 'node',
    osm_id: 1,
    category: 'shop',
    type: 'supermarket',
    name: 'Lidl',
    display_name: 'Lidl, Hamburg',
    address: { city: 'Hamburg', country_code: 'de' },
};

describe('rate limiting helpers', () => {
    it('spaces acquisitions by the minimum interval', async () => {
        const clock = fakeClock();
        const limiter = new RateLimiter(1000, clock);
        const starts: number[] = [];

        for (let index = 0; index < 3; index++) {
            await limiter.acquire();
            starts.push(clock.now());
        }

        expect(starts[1]! - starts[0]!).toBe(1000);
        expect(starts[2]! - starts[1]!).toBe(1000);
    });

    it('serialises concurrent callers', async () => {
        const clock = fakeClock();
        const limiter = new RateLimiter(1000, clock);
        const starts: number[] = [];

        await Promise.all([0, 1, 2].map(() => limiter.acquire().then(() => starts.push(clock.now()))));

        expect(starts).toEqual([starts[0], starts[0]! + 1000, starts[0]! + 2000]);
    });

    it('backs off exponentially and honours a longer Retry-After', () => {
        const options = { baseDelayMs: 2000, maxDelayMs: 60_000 };

        expect([0, 1, 2, 3, 10].map((attempt) => backoffDelayMs(attempt, options))).toEqual([
            2000, 4000, 8000, 16_000, 60_000,
        ]);
        expect(backoffDelayMs(0, options, 30_000)).toBe(30_000);
        expect(backoffDelayMs(3, options, 1000)).toBe(16_000);
    });

    it('parses Retry-After and classifies statuses', () => {
        expect(parseRetryAfterMs('5', 0)).toBe(5000);
        expect(parseRetryAfterMs(new Date(10_000).toUTCString(), 0)).toBe(10_000);
        expect(parseRetryAfterMs('soon', 0)).toBeUndefined();
        expect([429, 500, 503, 408].every(isRetryableStatus)).toBe(true);
        expect([400, 403, 404].some(isRetryableStatus)).toBe(false);
    });

    it('never goes faster than 1/s against the public instance', () => {
        expect(effectiveMinIntervalMs('https://nominatim.openstreetmap.org', 100)).toBe(1000);
        expect(effectiveMinIntervalMs('https://nominatim.openstreetmap.org', undefined)).toBe(1000);
        expect(effectiveMinIntervalMs('https://nominatim.openstreetmap.org', 1500)).toBe(1500);
        expect(effectiveMinIntervalMs('http://nominatim.local:8080', 100)).toBe(100);
        expect(effectiveMinIntervalMs('http://nominatim.local:8080', undefined)).toBe(1000);
    });
});

describe('NominatimClient', () => {
    it('sends the identifying User-Agent and Accept-Language and maps the answer', async () => {
        const requests: { url: string; headers: Record<string, string> }[] = [];
        const client = new NominatimClient({
            baseUrl: 'https://nominatim.openstreetmap.org',
            clock: fakeClock(),
            fetch: (url, init) => {
                requests.push({ url: String(url), headers: init?.headers as Record<string, string> });

                return Promise.resolve(jsonResponse(200, OK_BODY));
            },
        });

        const result = await client.reverse({ latitude: 53.5, longitude: 10 }, 'de,en');

        expect(result).toMatchObject({ ok: true, attempts: 1, details: { osmName: 'Lidl', osmCity: 'Hamburg' } });
        expect(requests[0]!.headers['User-Agent']).toBe(NOMINATIM_USER_AGENT);
        expect(requests[0]!.headers['User-Agent']).not.toContain('@');
        expect(requests[0]!.headers['Accept-Language']).toBe('de,en');
        expect(requests[0]!.url).toContain('/reverse?format=jsonv2');
    });

    it('retries 429 and 5xx with backoff, then succeeds', async () => {
        const clock = fakeClock();
        const responses = [
            jsonResponse(429, {}, { 'retry-after': '10' }),
            jsonResponse(503, {}),
            jsonResponse(200, OK_BODY),
        ];
        const requestTimes: number[] = [];
        const client = new NominatimClient({
            baseUrl: 'https://nominatim.openstreetmap.org',
            clock,
            fetch: () => {
                requestTimes.push(clock.now());

                return Promise.resolve(responses.shift()!);
            },
        });

        const result = await client.reverse({ latitude: 1, longitude: 2 }, 'en');

        expect(result).toMatchObject({ ok: true, attempts: 3 });
        // Retry-After (10 s) beats the first backoff step (2 s); the second retry waits 4 s.
        expect(requestTimes[1]! - requestTimes[0]!).toBe(10_000);
        expect(requestTimes[2]! - requestTimes[1]!).toBe(4000);
    });

    it('gives up after maxRetries and does not retry client errors', async () => {
        let calls = 0;
        const failing = new NominatimClient({
            baseUrl: 'https://nominatim.openstreetmap.org',
            clock: fakeClock(),
            maxRetries: 2,
            fetch: () => {
                calls++;

                return Promise.reject(new Error('ECONNRESET'));
            },
        });

        expect(await failing.reverse({ latitude: 1, longitude: 2 }, 'en')).toEqual({
            ok: false,
            error: 'ECONNRESET',
            attempts: 3,
        });
        expect(calls).toBe(3);

        calls = 0;
        const forbidden = new NominatimClient({
            baseUrl: 'https://nominatim.openstreetmap.org',
            clock: fakeClock(),
            fetch: () => {
                calls++;

                return Promise.resolve(new Response('blocked', { status: 403, statusText: 'Forbidden' }));
            },
        });

        expect(await forbidden.reverse({ latitude: 1, longitude: 2 }, 'en')).toMatchObject({
            ok: false,
            error: 'HTTP 403 Forbidden',
            attempts: 1,
        });
        expect(calls).toBe(1);
    });
});

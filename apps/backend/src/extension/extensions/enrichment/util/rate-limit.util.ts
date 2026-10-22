export interface Clock {
    now(): number;
    sleep(ms: number): Promise<void>;
}

export const SYSTEM_CLOCK: Clock = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Spaces calls at least `minIntervalMs` apart, measured from the start of one call to the start of the next. Callers
 * are served in order (each waits for the previous slot), so concurrent runs share the budget.
 */
export class RateLimiter {
    private nextSlot = 0;
    private queue: Promise<void> = Promise.resolve();

    constructor(
        private readonly minIntervalMs: number,
        private readonly clock: Clock = SYSTEM_CLOCK,
    ) {}

    public acquire(): Promise<void> {
        const slot = this.queue.then(async () => {
            const wait = this.nextSlot - this.clock.now();

            if (wait > 0) {
                await this.clock.sleep(wait);
            }

            this.nextSlot = this.clock.now() + this.minIntervalMs;
        });
        this.queue = slot;

        return slot;
    }

    /** Pushes the next slot back, e.g. after a 429 that asked to wait. */
    public delayUntil(timestamp: number): void {
        this.nextSlot = Math.max(this.nextSlot, timestamp);
    }
}

export interface BackoffOptions {
    baseDelayMs: number;
    maxDelayMs: number;
}

/** Exponential backoff for retry `attempt` (0-based); a server's Retry-After wins if it asks for longer. */
export function backoffDelayMs(attempt: number, options: BackoffOptions, retryAfterMs?: number): number {
    const exponential = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** attempt);

    return retryAfterMs !== undefined && retryAfterMs > exponential
        ? Math.min(retryAfterMs, options.maxDelayMs * 4)
        : exponential;
}

/** Retry-After as seconds or HTTP date, in milliseconds from `now`. */
export function parseRetryAfterMs(header: string | null | undefined, now: number): number | undefined {
    if (!header) {
        return undefined;
    }

    const seconds = Number(header);

    if (Number.isFinite(seconds)) {
        return Math.max(0, seconds * 1000);
    }

    const date = Date.parse(header);

    return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** Too many requests, and server errors that may go away. */
export function isRetryableStatus(status: number): boolean {
    return status === 429 || status === 408 || (status >= 500 && status <= 599);
}

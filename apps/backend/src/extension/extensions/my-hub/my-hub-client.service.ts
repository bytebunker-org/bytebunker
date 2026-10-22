import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MyHubConfig } from './my-hub.config.js';
import type {
    MyHubExportedCalendar,
    MyHubExportedPerson,
    MyHubExportPersonsPage,
} from './type/my-hub-export.interface.js';

export const MY_HUB_CONFIG = Symbol('MY_HUB_CONFIG');

const DEFAULT_PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 120_000;

export interface FetchMyHubPersonsOptions {
    /** Only persons changed at or after this instant (ISO 8601); see my-hub's `GET /export/persons`. */
    updatedSince?: string;
    includePlaceholders?: boolean;
    pageSize?: number;
}

/**
 * Read-only HTTP client for my-hub's export API. Only sends GET requests, and only sends credentials to the
 * configured my-hub origin.
 */
@Injectable()
export class MyHubClientService {
    private readonly logger = new Logger(MyHubClientService.name);

    constructor(@Optional() @Inject(MY_HUB_CONFIG) private readonly config: MyHubConfig | null) {}

    public isConfigured(): boolean {
        return Boolean(this.config?.baseUrl && this.config.token);
    }

    /** All persons, following the pages until `total` is reached. */
    public async fetchPersons(options: FetchMyHubPersonsOptions = {}): Promise<MyHubExportedPerson[]> {
        const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
        const persons: MyHubExportedPerson[] = [];

        for (let offset = 0; ; offset += pageSize) {
            const page = await this.getJson<MyHubExportPersonsPage>('/export/persons', {
                limit: String(pageSize),
                offset: String(offset),
                ...(options.updatedSince ? { updatedSince: options.updatedSince } : {}),
                ...(options.includePlaceholders ? { includePlaceholders: 'true' } : {}),
            });

            persons.push(...page.items);

            if (page.items.length === 0 || offset + page.items.length >= page.total) {
                break;
            }
        }

        this.logger.log(`Fetched ${persons.length} persons from my-hub`);

        return persons;
    }

    public listCalendars(): Promise<MyHubExportedCalendar[]> {
        return this.getJson<MyHubExportedCalendar[]>('/export/calendars');
    }

    /** A store calendar as one iCalendar document, as stored in my-hub (original UIDs). */
    public fetchCalendarIcs(slug: string): Promise<string> {
        return this.getText(this.buildUrl(`/export/calendars/${encodeURIComponent(slug)}/ics`));
    }

    /**
     * Downloads a feed by URL, e.g. a my-hub webcal URL with its `?token=`. `webcal://` is fetched over https. The
     * API token is only added when the URL is on the configured my-hub origin.
     */
    public fetchFeed(feedUrl: string): Promise<string> {
        const url = new URL(feedUrl.replace(/^webcals?:\/\//i, 'https://'));

        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new Error(`Unsupported feed URL protocol "${url.protocol}"`);
        }

        return this.getText(url, { authenticate: this.isMyHubOrigin(url) });
    }

    private buildUrl(path: string, query: Record<string, string> = {}): URL {
        const config = this.requireConfig();
        const url = new URL(
            path.replace(/^\//, ''),
            config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`,
        );

        for (const [key, value] of Object.entries(query)) {
            url.searchParams.set(key, value);
        }

        return url;
    }

    private async getJson<T>(path: string, query: Record<string, string> = {}): Promise<T> {
        const response = await this.request(this.buildUrl(path, query), {
            authenticate: true,
            accept: 'application/json',
        });

        return (await response.json()) as T;
    }

    private async getText(url: URL, { authenticate = true }: { authenticate?: boolean } = {}): Promise<string> {
        const response = await this.request(url, { authenticate, accept: 'text/calendar, */*' });

        return response.text();
    }

    private async request(
        url: URL,
        { authenticate, accept }: { authenticate: boolean; accept: string },
    ): Promise<Response> {
        const headers: Record<string, string> = { Accept: accept };

        if (authenticate) {
            const config = this.requireConfig();
            headers['Authorization'] = `Bearer ${config.token}`;

            if (config.cfAccessClientId && config.cfAccessClientSecret) {
                headers['CF-Access-Client-Id'] = config.cfAccessClientId;
                headers['CF-Access-Client-Secret'] = config.cfAccessClientSecret;
            }
        }

        const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            // Never echo the query string: webcal URLs carry their token there.
            throw new Error(`my-hub request GET ${url.origin}${url.pathname} failed with HTTP ${response.status}`);
        }

        return response;
    }

    private isMyHubOrigin(url: URL): boolean {
        return this.isConfigured() && new URL(this.config!.baseUrl).origin === url.origin;
    }

    private requireConfig(): MyHubConfig {
        if (!this.isConfigured()) {
            throw new Error(
                'my-hub is not configured: set myHub.baseUrl and myHub.token in env.yml (or MY_HUB__BASE_URL / MY_HUB__TOKEN)',
            );
        }

        return this.config!;
    }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyHubClientService } from './my-hub-client.service.js';
import type { MyHubConfig } from './my-hub.config.js';
import { createMyHubPerson, MY_HUB_CALENDAR_ICS } from './my-hub.fixture.js';

const CONFIG: MyHubConfig = { baseUrl: 'http://my-hub.test:11000', token: 'test-token' };

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('MyHubClientService', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const requestedUrl = (call: number): URL => fetchMock.mock.calls[call]![0] as URL;
    const requestInit = (call: number): RequestInit & { headers: Record<string, string> } =>
        fetchMock.mock.calls[call]![1] as RequestInit & { headers: Record<string, string> };

    it('pages through all persons with the bearer token', async () => {
        fetchMock
            .mockResolvedValueOnce(
                jsonResponse({ items: [createMyHubPerson({ id: 1 }), createMyHubPerson({ id: 2 })], total: 3 }),
            )
            .mockResolvedValueOnce(jsonResponse({ items: [createMyHubPerson({ id: 3 })], total: 3 }));

        const client = new MyHubClientService(CONFIG);
        const persons = await client.fetchPersons({ pageSize: 2, updatedSince: '2026-10-01T00:00:00Z' });

        expect(persons.map((person) => person.id)).toEqual([1, 2, 3]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(requestedUrl(0).toString()).toBe(
            'http://my-hub.test:11000/export/persons?limit=2&offset=0&updatedSince=2026-10-01T00%3A00%3A00Z',
        );
        expect(requestedUrl(1).searchParams.get('offset')).toBe('2');
        expect(requestInit(0).method).toBe('GET');
        expect(requestInit(0).headers['Authorization']).toBe('Bearer test-token');
        expect(requestInit(0).headers['CF-Access-Client-Id']).toBeUndefined();
    });

    it('keeps a base path and sends Cloudflare Access headers when configured', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse([]));

        const client = new MyHubClientService({
            ...CONFIG,
            baseUrl: 'https://hub.example.test/api/',
            cfAccessClientId: 'id',
            cfAccessClientSecret: 'secret',
        });
        await client.listCalendars();

        expect(requestedUrl(0).toString()).toBe('https://hub.example.test/api/export/calendars');
        expect(requestInit(0).headers).toMatchObject({
            'CF-Access-Client-Id': 'id',
            'CF-Access-Client-Secret': 'secret',
        });
    });

    it('downloads a store calendar as text', async () => {
        fetchMock.mockResolvedValueOnce(new Response(MY_HUB_CALENDAR_ICS, { status: 200 }));

        const ics = await new MyHubClientService(CONFIG).fetchCalendarIcs('personal cal');

        expect(ics).toBe(MY_HUB_CALENDAR_ICS);
        expect(requestedUrl(0).pathname).toBe('/export/calendars/personal%20cal/ics');
    });

    it('fetches webcal URLs over https and only sends the token to the my-hub origin', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(new Response(MY_HUB_CALENDAR_ICS, { status: 200 })));
        const client = new MyHubClientService({ ...CONFIG, baseUrl: 'https://hub.example.test' });

        await client.fetchFeed('webcal://hub.example.test/webcal/personal?token=feed-token');
        await client.fetchFeed('https://calendar.other.test/basic.ics');

        expect(requestedUrl(0).toString()).toBe('https://hub.example.test/webcal/personal?token=feed-token');
        expect(requestInit(0).headers['Authorization']).toBe('Bearer test-token');
        expect(requestInit(1).headers['Authorization']).toBeUndefined();
    });

    it('fails with the status but without the query string', async () => {
        fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }));

        await expect(
            new MyHubClientService(CONFIG).fetchFeed('http://my-hub.test:11000/webcal/x?token=secret'),
        ).rejects.toThrow(/^my-hub request GET http:\/\/my-hub.test:11000\/webcal\/x failed with HTTP 401$/);
    });

    it('explains a missing configuration and sends nothing', async () => {
        const client = new MyHubClientService(null);

        expect(client.isConfigured()).toBe(false);
        await expect(client.fetchPersons()).rejects.toThrow(/my-hub is not configured/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

import type { MyHubExportedPerson } from './type/my-hub-export.interface.js';

/** Synthetic my-hub export rows (fake names, numbers and ids). */
export function createMyHubPerson(overrides: Partial<MyHubExportedPerson> = {}): MyHubExportedPerson {
    return {
        id: 101,
        displayName: 'Erika Musterfrau',
        kind: 'individual',
        firstName: 'Erika',
        lastName: 'Musterfrau',
        nickname: 'Eri',
        nameAliases: [],
        birthday: '1990-04-01',
        organization: 'Example GmbH',
        jobTitle: null,
        isPlaceholder: false,
        isHidden: false,
        isDeceased: false,
        emails: ['Erika@Example.org'],
        phones: [
            { value: '0151 2345678', normalizedValue: '+491512345678' },
            { value: '(0651) 99 88 77', normalizedValue: null },
        ],
        impps: ['xmpp:erika@jabber.example.org', 'skype:erika.m', 'tel:+49 151 2345678'],
        handles: [
            { platform: 'whatsapp', key: 'key:abc123', displayName: 'Erika M', number: '+491512345678' },
            { platform: 'signal', key: 'name:Erika', displayName: 'Erika', number: null },
            { platform: 'phone', key: '+4965199887', displayName: null, number: null },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-10-01T12:00:00.000Z',
        ...overrides,
    };
}

export const MY_HUB_CALENDAR_ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//my-hub//backup export//EN',
    'X-WR-CALNAME:Personal',
    'BEGIN:VEVENT',
    'UID:4f1c2d3e5a6b@google.com',
    'DTSTAMP:20260901T000000Z',
    'DTSTART:20260901T120000Z',
    'DTEND:20260901T130000Z',
    'SUMMARY:Lunch with Erika',
    'ATTENDEE;CN=Erika Musterfrau:mailto:erika@example.org',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
].join('\r\n');

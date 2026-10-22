import type { ASObject } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import {
    normalizePhoneNumber,
    personStableKeys,
    type PersonIdentity,
} from '../../../../activity-graph/util/person-stable-key.util.js';
import type { MyHubExportedContactHandle, MyHubExportedPerson } from '../type/my-hub-export.interface.js';

type Handle = NonNullable<NonNullable<PersonIdentity['handles']>[number]>;

/** IMPP schemes that name the same service differently. */
const IMPP_PLATFORM_ALIASES: Record<string, string> = {
    jabber: 'xmpp',
    callto: 'skype',
    ymsgr: 'yahoo',
    msnim: 'msn',
};

/** Platforms whose ids are phone numbers, so the number also becomes a `person:phone:` key. */
const PHONE_NUMBER_PLATFORMS = new Set(['tel', 'sms', 'whatsapp', 'signal', 'phone']);

/** Contact handle platforms whose key is just the phone number (already covered by the phone key). */
const NUMBER_KEYED_HANDLE_PLATFORMS = new Set(['phone', 'sms']);

/**
 * Parses a vCard IMPP URI (`xmpp:anna@example.org`, `skype:anna.b`, `whatsapp:+49151…`, `aim:goim?screenname=x`) into
 * a platform and id. Returns undefined for values that are not URIs.
 */
export function parseImppUri(value: string): Handle | undefined {
    const match = /^([a-z][\d+.a-z-]*):(.+)$/i.exec(value.trim());

    if (!match) {
        return undefined;
    }

    const scheme = match[1]!.toLowerCase();
    let id = match[2]!.replace(/^\/\//, '');
    const screenName = /[&?]screenname=([^&]+)/i.exec(id)?.[1];
    id = screenName ? decodeURIComponent(screenName) : id.replace(/[#?].*$/, '');

    return id ? { platform: IMPP_PLATFORM_ALIASES[scheme] ?? scheme, id } : undefined;
}

/**
 * Identity of a my-hub person: its my-hub id plus every email, phone number and messenger handle it is known by, so
 * people seen by importers (calendar attendees by email, WhatsApp chat partners by display name, …) link to it.
 */
export function buildMyHubPersonIdentity(person: MyHubExportedPerson): PersonIdentity {
    const phones: string[] = person.phones.map((phone) => phone.normalizedValue ?? phone.value);
    const handles: Handle[] = [];

    for (const impp of person.impps) {
        const handle = parseImppUri(impp);

        if (!handle) continue;

        if (PHONE_NUMBER_PLATFORMS.has(handle.platform) && normalizePhoneNumber(handle.id)) {
            phones.push(handle.id);
        }

        // tel:/sms: IMPP entries are phone numbers, not accounts.
        if (handle.platform !== 'tel' && handle.platform !== 'sms') {
            handles.push(handle);
        }
    }

    for (const contactHandle of person.handles) {
        const { phone, handles: contactHandleKeys } = contactHandleIdentity(contactHandle);

        if (phone) phones.push(phone);
        handles.push(...contactHandleKeys);
    }

    return {
        myHubPersonId: String(person.id),
        emails: person.emails,
        phones,
        handles,
    };
}

/**
 * - the channel's number (calls, SMS, WhatsApp JIDs) becomes a phone key;
 * - WhatsApp handles also get `{ platform: 'whatsapp-name', id: displayName }`, the name a WhatsApp chat export shows
 *   for the chat partner; `name:` keys of other messengers likewise `<platform>-name`;
 * - other messenger keys (`key:…`, `conv:…`) stay `{ platform, id: key }`.
 */
function contactHandleIdentity(handle: MyHubExportedContactHandle): { phone?: string; handles: Handle[] } {
    const platform = handle.platform.toLowerCase();
    const handles: Handle[] = [];
    const phone = handle.number ?? (NUMBER_KEYED_HANDLE_PLATFORMS.has(platform) ? handle.key : undefined);
    const name = handle.key.startsWith('name:') ? handle.key.slice('name:'.length) : undefined;

    if (platform === 'whatsapp' && handle.displayName?.trim()) {
        handles.push({ platform: 'whatsapp-name', id: handle.displayName });
    }

    if (name?.trim()) {
        handles.push({ platform: `${platform}-name`, id: name });
    } else if (!NUMBER_KEYED_HANDLE_PLATFORMS.has(platform) && handle.key.trim()) {
        handles.push({ platform, id: handle.key });
    }

    return { phone: phone ?? undefined, handles };
}

/**
 * The Person object a my-hub person is stored as. Empty fields are sent as null so a value cleared in my-hub is
 * removed from the node as well (my-hub is the source of truth for persons).
 */
export function myHubPersonToObject(person: MyHubExportedPerson, defaultCountryCode = '49'): ASObject {
    return {
        '@type': 'Person',
        '@secondaryTypes': [createUnknownASType('MyHubPerson')],
        stableKeys: personStableKeys(buildMyHubPersonIdentity(person), defaultCountryCode),
        name: person.displayName,
        givenName: person.firstName || null,
        familyName: person.lastName || null,
        nickname: person.nickname || null,
        birthday: person.birthday || null,
        organization: person.organization || null,
        jobTitle: person.jobTitle || null,
        myHubId: person.id,
        myHubUpdatedAt: person.updatedAt,
    } as unknown as ASObject;
}

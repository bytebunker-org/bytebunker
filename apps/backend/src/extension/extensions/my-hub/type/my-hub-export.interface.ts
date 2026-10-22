/**
 * Response shapes of my-hub's read-only export API (`apps/backend/src/export` in my-hub, branch
 * feat/bytebunker-person-export).
 */

export interface MyHubExportedPhone {
    value: string;
    /** E.164, null when my-hub could not parse the value. */
    normalizedValue: string | null;
}

/** my-hub `contact_handle` linked to the person. */
export interface MyHubExportedContactHandle {
    platform: 'phone' | 'whatsapp' | 'signal' | 'sms' | 'instagram' | 'snapchat' | 'telegram' | (string & {});
    /** E.164 number for calls/SMS, `key:`/`conv:`/`name:` prefixed id for messengers. */
    key: string;
    displayName: string | null;
    number: string | null;
}

export interface MyHubExportedPerson {
    id: number;
    displayName: string;
    kind: 'individual' | 'organization' | (string & {});
    firstName: string | null;
    lastName: string | null;
    nickname: string | null;
    nameAliases: string[];
    birthday: string | null;
    organization: string | null;
    jobTitle: string | null;
    isPlaceholder: boolean;
    isHidden: boolean;
    isDeceased: boolean;
    emails: string[];
    phones: MyHubExportedPhone[];
    /** vCard IMPP URIs, e.g. `xmpp:anna@example.org`. */
    impps: string[];
    handles: MyHubExportedContactHandle[];
    createdAt: string;
    updatedAt: string;
}

export interface MyHubExportPersonsPage {
    items: MyHubExportedPerson[];
    total: number;
}

export interface MyHubExportedCalendar {
    id: number;
    slug: string;
    name: string;
    /** STORED (original UIDs) or DERIVED (importer-owned, synthetic UIDs). */
    type: string;
    componentSet: string[];
}

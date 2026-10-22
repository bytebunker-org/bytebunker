/**
 * Stable keys that identify a person across sources. my-hub persons are the source of truth: the my-hub
 * person sync writes a Person node carrying every key below that it knows (my-hub id, all emails, phones and
 * messenger handles). Importers emit Person objects with whatever handle they have (an attendee's email, an
 * Airbnb account id, a WhatsApp display name); the persister reuses a node when any stable key matches, so
 * people link to the my-hub person automatically once the sync has run.
 *
 * Keys are plain readable strings (not hashed) so they can be matched and debugged directly.
 */

export interface PersonIdentity {
    myHubPersonId?: string;
    emails?: (string | undefined)[];
    phones?: (string | undefined)[];
    /** Account or handle on a platform, e.g. `{ platform: 'airbnb', id: '323180213' }`. */
    handles?: ({ platform: string; id: string } | undefined)[];
}

export function personStableKeys(identity: PersonIdentity, defaultCountryCode = '49'): string[] {
    const keys = new Set<string>();

    if (identity.myHubPersonId) {
        keys.add(`person:myhub:${identity.myHubPersonId}`);
    }

    for (const email of identity.emails ?? []) {
        const normalized = normalizeEmail(email);
        if (normalized) keys.add(`person:email:${normalized}`);
    }

    for (const phone of identity.phones ?? []) {
        const normalized = normalizePhoneNumber(phone, defaultCountryCode);
        if (normalized) keys.add(`person:phone:${normalized}`);
    }

    for (const handle of identity.handles ?? []) {
        const platform = handle?.platform.trim().toLowerCase();
        const id = handle?.id.trim();
        if (platform && id) keys.add(`person:handle:${platform}:${id.toLowerCase()}`);
    }

    return [...keys];
}

export function normalizeEmail(email: string | undefined): string | undefined {
    const normalized = email
        ?.trim()
        .replace(/^mailto:/i, '')
        .toLowerCase();

    return normalized && /^[^\s@]+@[^\s@]+$/.test(normalized) ? normalized : undefined;
}

/**
 * Best-effort E.164 without a phone library: `0049 651 123`, `+49 (0)651-123`, `0651 123` (with default country
 * 49) all become `+49651123`. Returns undefined for short codes and anything that is not a phone number.
 */
export function normalizePhoneNumber(phone: string | undefined, defaultCountryCode = '49'): string | undefined {
    if (!phone) {
        return undefined;
    }

    let value = phone.trim().replace(/^tel:/i, '');
    const hasPlus = value.startsWith('+');
    // "+49 (0)651": the trunk zero in parentheses is not dialled internationally.
    value = value.replaceAll('(0)', '');
    let digits = value.replaceAll(/\D/g, '');

    if (hasPlus) {
        // already international
    } else if (digits.startsWith('00')) {
        digits = digits.slice(2);
    } else if (digits.startsWith('0')) {
        digits = defaultCountryCode + digits.slice(1);
    } else {
        return undefined;
    }

    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : undefined;
}

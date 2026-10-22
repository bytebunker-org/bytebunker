import ICAL from 'ical.js';
import { DateTime, FixedOffsetZone, IANAZone } from 'luxon';
import type { IcsDateKind, IcsDateValue, IcsJCalComponent } from '@bytebunker/event-schema/extension/ics';

/**
 * Windows zone names (as written by Outlook/Exchange) mapped to IANA zones. Covers the CLDR "001" territory
 * entries for the zones that realistically show up in personal calendars; anything else falls back to the
 * VTIMEZONE definition in the file.
 */
const WINDOWS_ZONE_MAP: Record<string, string> = {
    'Dateline Standard Time': 'Etc/GMT+12',
    'UTC-11': 'Etc/GMT+11',
    'Hawaiian Standard Time': 'Pacific/Honolulu',
    'Alaskan Standard Time': 'America/Anchorage',
    'Pacific Standard Time': 'America/Los_Angeles',
    'Mountain Standard Time': 'America/Denver',
    'US Mountain Standard Time': 'America/Phoenix',
    'Central Standard Time': 'America/Chicago',
    'Central America Standard Time': 'America/Guatemala',
    'Eastern Standard Time': 'America/New_York',
    'Atlantic Standard Time': 'America/Halifax',
    'Newfoundland Standard Time': 'America/St_Johns',
    'E. South America Standard Time': 'America/Sao_Paulo',
    'Argentina Standard Time': 'America/Buenos_Aires',
    'UTC-02': 'Etc/GMT+2',
    'Azores Standard Time': 'Atlantic/Azores',
    UTC: 'Etc/UTC',
    'GMT Standard Time': 'Europe/London',
    'Greenwich Standard Time': 'Atlantic/Reykjavik',
    'W. Europe Standard Time': 'Europe/Berlin',
    'Central Europe Standard Time': 'Europe/Budapest',
    'Romance Standard Time': 'Europe/Paris',
    'Central European Standard Time': 'Europe/Warsaw',
    'W. Central Africa Standard Time': 'Africa/Lagos',
    'GTB Standard Time': 'Europe/Bucharest',
    'E. Europe Standard Time': 'Europe/Chisinau',
    'FLE Standard Time': 'Europe/Kiev',
    'Israel Standard Time': 'Asia/Jerusalem',
    'South Africa Standard Time': 'Africa/Johannesburg',
    'Egypt Standard Time': 'Africa/Cairo',
    'Turkey Standard Time': 'Europe/Istanbul',
    'Russian Standard Time': 'Europe/Moscow',
    'Arab Standard Time': 'Asia/Riyadh',
    'Arabian Standard Time': 'Asia/Dubai',
    'Iran Standard Time': 'Asia/Tehran',
    'Pakistan Standard Time': 'Asia/Karachi',
    'India Standard Time': 'Asia/Calcutta',
    'Nepal Standard Time': 'Asia/Katmandu',
    'Bangladesh Standard Time': 'Asia/Dhaka',
    'SE Asia Standard Time': 'Asia/Bangkok',
    'China Standard Time': 'Asia/Shanghai',
    'Singapore Standard Time': 'Asia/Singapore',
    'Taipei Standard Time': 'Asia/Taipei',
    'Tokyo Standard Time': 'Asia/Tokyo',
    'Korea Standard Time': 'Asia/Seoul',
    'AUS Central Standard Time': 'Australia/Darwin',
    'AUS Eastern Standard Time': 'Australia/Sydney',
    'E. Australia Standard Time': 'Australia/Brisbane',
    'New Zealand Standard Time': 'Pacific/Auckland',
};

/** Outlook sometimes writes the display name instead of the zone id, e.g. `(UTC+01:00) Amsterdam, Berlin, ...`. */
const WINDOWS_DISPLAY_NAME_MAP: [RegExp, string][] = [
    [/Amsterdam, Berlin/i, 'Europe/Berlin'],
    [/Brussels, Copenhagen, Madrid, Paris/i, 'Europe/Paris'],
    [/Belgrade, Bratislava, Budapest/i, 'Europe/Budapest'],
    [/Sarajevo, Skopje, Warsaw/i, 'Europe/Warsaw'],
    [/Dublin, Edinburgh, Lisbon, London/i, 'Europe/London'],
    [/Coordinated Universal Time|^\(UTC\)$/i, 'Etc/UTC'],
    [/Eastern Time \(US & Canada\)/i, 'America/New_York'],
    [/Pacific Time \(US & Canada\)/i, 'America/Los_Angeles'],
    [/Osaka, Sapporo, Tokyo/i, 'Asia/Tokyo'],
];

/**
 * Resolves a TZID as written in a file to an IANA zone: IANA names directly, vendor prefixed ids such as
 * `/mozilla.org/20050126_1/Europe/Berlin` or `/freeassociation.sourceforge.net/Tzfile/Europe/Berlin` by their
 * trailing Area/City part, and Windows zone ids / display names via lookup tables.
 */
export function resolveTzidToIana(tzid: string | undefined): string | undefined {
    if (!tzid) {
        return undefined;
    }

    const cleaned = tzid.trim().replace(/^"|"$/g, '');

    if (isValidIanaZone(cleaned)) {
        return cleaned;
    }

    const segments = cleaned.split('/').filter(Boolean);

    for (let i = 1; i < segments.length; i++) {
        const candidate = segments.slice(i).join('/');

        if (candidate.includes('/') && isValidIanaZone(candidate)) {
            return candidate;
        }
    }

    const windowsZone = WINDOWS_ZONE_MAP[cleaned];

    if (windowsZone) {
        return windowsZone;
    }

    return WINDOWS_DISPLAY_NAME_MAP.find(([pattern]) => pattern.test(cleaned))?.[1];
}

function isValidIanaZone(zone: string): boolean {
    // "Z", "UTC+1" and similar are valid luxon zones but not IANA names written by calendar producers.
    return /^[A-Za-z]+(\/[A-Za-z0-9_+-]+)+$|^(UTC|GMT|Etc\/UTC)$/.test(zone) && IANAZone.isValidZone(zone);
}

export interface IcsTimezoneContext {
    /** Zone used for floating and DATE values. */
    floatingZone: string;
    /** VTIMEZONE definitions of the file, by TZID. */
    vtimezones: Map<string, ICAL.Timezone>;
}

export function buildTimezoneContext(vtimezones: IcsJCalComponent[], floatingZone: string): IcsTimezoneContext {
    const map = new Map<string, ICAL.Timezone>();

    for (const vtimezone of vtimezones) {
        try {
            const timezone = new ICAL.Timezone(new ICAL.Component(vtimezone));

            if (timezone.tzid) {
                map.set(timezone.tzid, timezone);
            }
        } catch {
            // Broken VTIMEZONE: values referencing it fall back to the floating zone.
        }
    }

    return { floatingZone, vtimezones: map };
}

export interface ResolvedIcsDate {
    value: IcsDateValue;
    dateTime: DateTime<true>;
}

/**
 * Converts a jCal date or date-time value (`2026-09-01`, `2026-09-01T14:00:00`, `2026-09-01T14:00:00Z`) with an
 * optional TZID to an `IcsDateValue` and a luxon DateTime. Returns undefined for unparseable values.
 */
export function resolveIcsDate(
    jcalValue: string,
    valueType: string,
    tzid: string | undefined,
    context: IcsTimezoneContext,
): ResolvedIcsDate | undefined {
    const basicValue = jcalValue.replace(/[-:]/g, '');

    if (valueType === 'date' || /^\d{4}-\d{2}-\d{2}$/.test(jcalValue)) {
        const dateTime = DateTime.fromISO(jcalValue, { zone: context.floatingZone }).startOf('day');

        return toResolved(dateTime, basicValue, 'date', tzid, undefined);
    }

    if (jcalValue.endsWith('Z')) {
        return toResolved(DateTime.fromISO(jcalValue, { zone: 'utc' }), basicValue, 'utc', tzid, undefined);
    }

    if (tzid) {
        const ianaZone = resolveTzidToIana(tzid);

        if (ianaZone) {
            return toResolved(DateTime.fromISO(jcalValue, { zone: ianaZone }), basicValue, 'zoned', tzid, ianaZone);
        }

        const vtimezone = context.vtimezones.get(tzid);

        if (vtimezone) {
            try {
                const offsetSeconds = vtimezone.utcOffset(ICAL.Time.fromDateTimeString(jcalValue));
                const zone = FixedOffsetZone.instance(Math.round(offsetSeconds / 60));

                return toResolved(DateTime.fromISO(jcalValue, { zone }), basicValue, 'zoned', tzid, undefined);
            } catch {
                // Fall through to the floating zone.
            }
        }
    }

    return toResolved(
        DateTime.fromISO(jcalValue, { zone: context.floatingZone }),
        basicValue,
        tzid ? 'zoned' : 'floating',
        tzid,
        undefined,
    );
}

function toResolved(
    dateTime: DateTime,
    basicValue: string,
    kind: IcsDateKind,
    tzid: string | undefined,
    resolvedZone: string | undefined,
): ResolvedIcsDate | undefined {
    if (!dateTime.isValid) {
        return undefined;
    }

    return {
        dateTime,
        value: {
            value: basicValue,
            kind,
            iso: dateTime.toISO()!,
            ...(tzid ? { tzid } : {}),
            ...(resolvedZone ? { resolvedZone } : {}),
        },
    };
}

/** Per-instance key of a recurrence: UTC basic format for date-times, plain date for all-day series. */
export function buildRecurrenceKey(resolved: ResolvedIcsDate): string {
    if (resolved.value.kind === 'date') {
        return resolved.dateTime.toFormat('yyyyLLdd');
    }

    return resolved.dateTime.toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
}

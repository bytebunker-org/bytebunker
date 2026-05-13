import ICAL from 'ical.js';
import { DateTime } from 'luxon';

export interface ParsedAttendee {
    name?: string;
    email: string;
    status?: string;
}

export function icalTimeToLuxon(time: ICAL.Time | null | undefined): DateTime<true> | undefined {
    if (!time) {
        return undefined;
    }

    if (time.isDate) {
        const dt = DateTime.fromObject(
            { year: time.year, month: time.month, day: time.day },
            { zone: 'utc' },
        );

        return dt.isValid ? dt : undefined;
    }

    const jsDate = time.toJSDate();
    const zone = time.zone?.tzid;
    const dt = zone ? DateTime.fromJSDate(jsDate, { zone }) : DateTime.fromJSDate(jsDate);

    return dt.isValid ? dt : undefined;
}

export function firstParameterString(property: ICAL.Property, name: string): string | undefined {
    const value = property.getParameter(name) as string | string[] | undefined;

    if (!value) {
        return undefined;
    }

    const first = Array.isArray(value) ? value[0] : value;

    return typeof first === 'string' && first.length > 0 ? first : undefined;
}

export function extractAttendeeEmail(property: ICAL.Property): string | undefined {
    const raw = property.getFirstValue();
    const uri = typeof raw === 'string' ? raw.trim() : '';

    if (!uri) {
        return undefined;
    }

    return uri.toLowerCase().startsWith('mailto:') ? uri.slice('mailto:'.length) : uri;
}

export function parseAttendees(properties: ICAL.Property[] | undefined): ParsedAttendee[] {
    if (!properties?.length) {
        return [];
    }

    const result: ParsedAttendee[] = [];

    for (const property of properties) {
        const email = extractAttendeeEmail(property);

        if (!email) {
            continue;
        }

        const name = firstParameterString(property, 'cn');
        const status = firstParameterString(property, 'partstat');

        result.push({
            email,
            ...(name ? { name } : {}),
            ...(status ? { status } : {}),
        });
    }

    return result;
}

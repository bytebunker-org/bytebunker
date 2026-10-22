import { DateTime } from 'luxon';

/**
 * Zone abbreviations Takeout HTML prints after the time, as fixed UTC offsets in hours. Google renders every
 * timestamp of an export with the abbreviation of the account's zone at export time (MEZ/CEST year-round), so the
 * abbreviation is taken literally instead of applying DST rules of an IANA zone.
 */
const ZONE_OFFSET_HOURS: Record<string, number> = {
    UTC: 0,
    GMT: 0,
    WET: 0,
    WEZ: 0,
    WEST: 1,
    WESZ: 1,
    BST: 1,
    IST: 1,
    CET: 1,
    MEZ: 1,
    CEST: 2,
    MESZ: 2,
    EET: 2,
    OEZ: 2,
    EEST: 3,
    OESZ: 3,
    MSK: 3,
    AST: -4,
    ADT: -3,
    EST: -5,
    EDT: -4,
    CST: -6,
    CDT: -5,
    MST: -7,
    MDT: -6,
    PST: -8,
    PDT: -7,
    AKST: -9,
    AKDT: -8,
    HST: -10,
    JST: 9,
    KST: 9,
};

const MONTHS: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};

const ZONE = String.raw`([A-Z]{2,5}|(?:GMT|UTC)[+-]\d{1,2}(?::?\d{2})?)`;

/** `03.02.2025, 12:08:18 MEZ` */
const GERMAN_PATTERN = new RegExp(String.raw`^(\d{1,2})\.(\d{1,2})\.(\d{4}),? (\d{1,2}):(\d{2}):(\d{2}) ${ZONE}$`);

/** `Feb 3, 2025, 12:08:18 PM CET` (en-US; newer exports put U+202F before AM/PM). */
const US_PATTERN = new RegExp(
    String.raw`^([A-Za-z]{3,4})\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}):(\d{2}) ?([AP]M) ${ZONE}$`,
    'i',
);

/** `3 Feb 2025, 12:08:18 CET` (en-GB, 24 h). */
const UK_PATTERN = new RegExp(String.raw`^(\d{1,2}) ([A-Za-z]{3,4})\.? (\d{4}),? (\d{1,2}):(\d{2}):(\d{2}) ${ZONE}$`);

/**
 * Parses the timestamp line of Takeout activity HTML (My Activity, YouTube watch and search history) in the German
 * and English renderings. Returns a DateTime in the fixed offset the export printed, or undefined.
 */
export function parseTakeoutTimestamp(raw: string): DateTime<true> | undefined {
    const text = raw.replaceAll(/\s+/g, ' ').trim();

    let match = GERMAN_PATTERN.exec(text);

    if (match) {
        const [, day, month, year, hour, minute, second, zone] = match;

        return build(+year!, +month!, +day!, +hour!, +minute!, +second!, zone!);
    }

    match = US_PATTERN.exec(text);

    if (match) {
        const [, monthName, day, year, hour, minute, second, meridiem, zone] = match;
        const month = MONTHS[monthName!.toLowerCase()];

        if (!month || +hour! < 1 || +hour! > 12) {
            return undefined;
        }

        const hour24 = (+hour! % 12) + (meridiem!.toUpperCase() === 'PM' ? 12 : 0);

        return build(+year!, month, +day!, hour24, +minute!, +second!, zone!);
    }

    match = UK_PATTERN.exec(text);

    if (match) {
        const [, day, monthName, year, hour, minute, second, zone] = match;
        const month = MONTHS[monthName!.toLowerCase()];

        return month ? build(+year!, month, +day!, +hour!, +minute!, +second!, zone!) : undefined;
    }

    return undefined;
}

/** True if the line is a Takeout timestamp; cheaper pre-check than parsing. */
export function looksLikeTakeoutTimestamp(raw: string): boolean {
    return /\d{1,2}:\d{2}:\d{2}/.test(raw) && parseTakeoutTimestamp(raw) !== undefined;
}

function build(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    zoneText: string,
): DateTime<true> | undefined {
    const zone = toFixedZone(zoneText);

    if (!zone) {
        return undefined;
    }

    const dt = DateTime.fromObject({ year, month, day, hour, minute, second }, { zone });

    return dt.isValid ? dt : undefined;
}

function toFixedZone(zoneText: string): string | undefined {
    const upper = zoneText.toUpperCase();
    const hours = ZONE_OFFSET_HOURS[upper];

    if (hours !== undefined) {
        return hours === 0 ? 'UTC' : `UTC${hours > 0 ? '+' : ''}${hours}`;
    }

    const offset = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(upper);

    if (!offset) {
        return undefined;
    }

    const [, sign, h, m] = offset;

    return `UTC${sign}${h}${m && m !== '00' ? `:${m}` : ''}`;
}

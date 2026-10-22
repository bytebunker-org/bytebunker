import type {
    WhatsAppChatFormat,
    WhatsAppChatModel,
    WhatsAppMessageKind,
    WhatsAppMessageModel,
} from '@bytebunker/event-schema/extension/whatsapp';

/**
 * Parser for WhatsApp "Export chat" text files. The header format depends on the phone's OS and locale
 * (`1/2/26, 9:05 - ` on a US Android, `02.01.26, 09:05 - ` on a German one, `[02.01.26, 09:05:33] ` on iOS, 12h
 * with AM/PM and a narrow no-break space, 4-digit years), so the format is detected from the file itself: every
 * candidate header regex is run over all lines and the one matching most lines wins. Day/month order is decided
 * by scanning for values above 12.
 */

type HeaderStyle = WhatsAppChatFormat['style'];
type DateSeparator = WhatsAppChatFormat['dateSeparator'];

interface HeaderCandidate {
    style: HeaderStyle;
    dateSeparator: DateSeparator;
    regex: RegExp;
}

interface HeaderMatch {
    first: number;
    second: number;
    year: number;
    hour: number;
    minute: number;
    second_: number;
    meridiem?: 'am' | 'pm';
    rest: string;
}

const SEPARATORS: DateSeparator[] = ['/', '.', '-'];

/** Directional marks, BOM and embedding controls WhatsApp sprinkles in front of names, headers and placeholders. */
const INVISIBLE_MARKS = new RegExp(String.raw`[\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069]`, 'g');
/** No-break spaces: the narrow one separates the time from AM/PM in recent exports. */
const SPECIAL_SPACES = new RegExp(String.raw`[\u00A0\u202F\u2007]`, 'g');

const TIME_PATTERN = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?([AaPp])\.?\s?[Mm]\.?)?`;

function buildCandidates(): HeaderCandidate[] {
    const candidates: HeaderCandidate[] = [];

    for (const separator of SEPARATORS) {
        const escaped = separator === '.' ? String.raw`\.` : separator;
        const date = String.raw`(\d{1,2})${escaped}(\d{1,2})${escaped}(\d{2}|\d{4})`;

        candidates.push(
            { style: 'android', dateSeparator: separator, regex: new RegExp(`^${date},? ${TIME_PATTERN} - (.*)$`) },
            { style: 'ios', dateSeparator: separator, regex: new RegExp(`^\\[${date},? ${TIME_PATTERN}\\] ?(.*)$`) },
        );
    }

    return candidates;
}

const HEADER_CANDIDATES = buildCandidates();

export function normalizeWhatsAppText(raw: string): string {
    return raw
        .replaceAll(INVISIBLE_MARKS, '')
        .replaceAll(SPECIAL_SPACES, ' ')
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n');
}

function matchHeader(candidate: HeaderCandidate, line: string): HeaderMatch | undefined {
    const match = candidate.regex.exec(line);

    if (!match) {
        return undefined;
    }

    const [, first, second, year, hour, minute, seconds, meridiem, rest] = match;
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);

    return {
        first: Number(first),
        second: Number(second),
        year: fullYear,
        hour: Number(hour),
        minute: Number(minute),
        second_: seconds ? Number(seconds) : 0,
        meridiem: meridiem ? (meridiem.toLowerCase() === 'p' ? 'pm' : 'am') : undefined,
        rest,
    };
}

/** Picks the header candidate that matches most lines, or undefined when no line looks like a header. */
export function detectHeaderCandidate(lines: string[]): HeaderCandidate | undefined {
    let best: HeaderCandidate | undefined;
    let bestCount = 0;

    for (const candidate of HEADER_CANDIDATES) {
        let count = 0;

        for (const line of lines) {
            if (candidate.regex.test(line)) {
                count++;
            }
        }

        if (count > bestCount) {
            best = candidate;
            bestCount = count;
        }
    }

    return best;
}

/**
 * Cheap content sniffing for `detectFile`: true when at least two (or all, for a tiny file) of the first non-empty
 * lines are headers of one known format.
 */
export function looksLikeWhatsAppChat(head: string): boolean {
    const lines = normalizeWhatsAppText(head)
        .split('\n')
        .filter((line) => line.trim())
        .slice(0, 12);
    const candidate = detectHeaderCandidate(lines);

    if (!candidate) {
        return false;
    }

    const headers = lines.filter((line) => candidate.regex.test(line)).length;

    return headers >= Math.min(2, lines.length) && headers >= lines.length / 2;
}

function pad(value: number, length = 2): string {
    return String(value).padStart(length, '0');
}

function toHour24(hour: number, meridiem: 'am' | 'pm' | undefined): number {
    if (!meridiem) {
        return hour;
    }

    return (hour % 12) + (meridiem === 'pm' ? 12 : 0);
}

function isValidDate(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1) {
        return false;
    }

    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const SYSTEM_SENDER_FORBIDDEN = /["«»“”]/;
const SENDER_SPLIT = /^([^:]{1,100}?): ([\S\s]*)$|^([^:]{1,100}?):$/;

function splitSender(rest: string): { sender?: string; text: string } {
    const match = SENDER_SPLIT.exec(rest);

    if (!match) {
        return { text: rest };
    }

    const sender = (match[1] ?? match[3]).trim();

    // `You changed the subject to “a: b”` is a system line whose quoted part contains a colon.
    if (!sender || SYSTEM_SENDER_FORBIDDEN.test(sender)) {
        return { text: rest };
    }

    return { sender, text: match[2] ?? '' };
}

const EDITED_SUFFIX = /\s*<(?:this message was edited|diese nachricht wurde bearbeitet)>\s*$/i;
const DELETED =
    /^(?:you deleted this message|this message was deleted|du hast diese nachricht gelöscht|diese nachricht wurde gelöscht)\.?$/i;
const LOCATION = /^(?:live )?(?:location|standort)\s*:\s*(https?:\/\/\S+)/i;
const LIVE_LOCATION = /^live (?:location shared|standort geteilt)\.?$/i;
const COORDINATES = /[&?](?:q|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const POLL = /^(?:poll|umfrage):$/i;
const ATTACHED_IOS = /^<(?:attached|anhang):\s*(.+?)>$/i;
const ATTACHED_ANDROID = /^(.+?)\s+\((?:file attached|datei angehängt)\)$/i;
const MEDIA_OMITTED = /^<(?:media omitted|medien ausgeschlossen)>$/i;
const TYPED_OMITTED =
    /^<?(?:image|video|audio|sticker|gif|document|contact card|voice message|photo|bild|dokument|kontaktkarte|sprachnachricht|foto) (?:omitted|weggelassen)>?$/i;
const CONTACT_OMITTED = /^<?(?:contact card|kontaktkarte) (?:omitted|weggelassen)>?$/i;
const CALL_SYSTEM =
    /^(?:(?:missed|verpasster|verpasste)\b.*(?:call|anruf)|(?:voice|video|sprach)[ -]?(?:call|anruf)\b.*)$/i;
const CALL_WITH_SENDER = /^(?:missed (?:voice|video) call|verpasster (?:sprach|video)anruf)$/i;

interface Classified {
    kind: WhatsAppMessageKind;
    text: string;
    edited: boolean;
    mediaFileName?: string;
    latitude?: number;
    longitude?: number;
}

function classify(rawText: string, hasSender: boolean): Classified {
    let text = rawText.trim();
    const edited = EDITED_SUFFIX.test(text);

    if (edited) {
        text = text.replace(EDITED_SUFFIX, '').trim();
    }

    if (DELETED.test(text)) {
        return { kind: 'deleted', text: '', edited };
    }

    if (!hasSender) {
        return { kind: CALL_SYSTEM.test(text) ? 'call' : 'system', text, edited };
    }

    if (CALL_WITH_SENDER.test(text)) {
        return { kind: 'call', text, edited };
    }

    const [firstLine, ...otherLines] = text.split('\n');
    const first = firstLine.trim();
    const caption = otherLines.join('\n').trim();

    const location = LOCATION.exec(first);
    if (location || LIVE_LOCATION.test(first)) {
        const coordinates = location ? COORDINATES.exec(location[1]) : null;

        return {
            kind: 'location',
            text,
            edited,
            ...(coordinates ? { latitude: Number(coordinates[1]), longitude: Number(coordinates[2]) } : {}),
        };
    }

    if (POLL.test(first)) {
        return { kind: 'poll', text, edited };
    }

    const attached = ATTACHED_IOS.exec(first) ?? ATTACHED_ANDROID.exec(first);
    if (attached) {
        const mediaFileName = attached[1].trim();

        return {
            kind: /\.vcf$/i.test(mediaFileName) ? 'contact' : 'media',
            text: caption,
            edited,
            mediaFileName,
        };
    }

    if (MEDIA_OMITTED.test(first) || TYPED_OMITTED.test(first)) {
        return { kind: CONTACT_OMITTED.test(first) ? 'contact' : 'media', text: caption, edited };
    }

    return { kind: 'text', text, edited };
}

/** Candidate date orders per detected header: decided by values above 12, otherwise by the separator's habit. */
function decideDateOrder(
    headers: HeaderMatch[],
    separator: DateSeparator,
): { dateOrder: WhatsAppChatFormat['dateOrder']; guessed: boolean } {
    const firstAbove12 = headers.some((header) => header.first > 12);
    const secondAbove12 = headers.some((header) => header.second > 12);

    if (firstAbove12 && !secondAbove12) {
        return { dateOrder: 'DMY', guessed: false };
    }

    if (secondAbove12 && !firstAbove12) {
        return { dateOrder: 'MDY', guessed: false };
    }

    // Dots and dashes are European, a slash is ambiguous (UK is DMY) and defaults to the US order.
    return { dateOrder: separator === '/' ? 'MDY' : 'DMY', guessed: !firstAbove12 && !secondAbove12 };
}

export function parseWhatsAppChat(rawText: string): WhatsAppChatModel {
    const lines = normalizeWhatsAppText(rawText).split('\n');
    const candidate = detectHeaderCandidate(lines);

    if (!candidate) {
        return {
            format: { style: 'android', dateSeparator: '/', dateOrder: 'MDY', hour12: false, dateOrderGuessed: true },
            messages: [],
            skippedLines: lines.filter((line) => line.trim()).length,
        };
    }

    const headerPerLine = lines.map((line) => matchHeader(candidate, line));
    const headers = headerPerLine.filter((header): header is HeaderMatch => header !== undefined);
    const { dateOrder, guessed } = decideDateOrder(headers, candidate.dateSeparator);
    const hour12 = headers.some((header) => header.meridiem);

    const messages: WhatsAppMessageModel[] = [];
    let skippedLines = 0;
    let current: { header: HeaderMatch; lineNumber: number; wallTime: string; body: string[] } | undefined;

    const flush = (): void => {
        if (!current) {
            return;
        }

        const { sender, text } = splitSender(current.body.join('\n'));
        const classified = classify(text, sender !== undefined);

        messages.push({
            wallTime: current.wallTime,
            ...(sender === undefined ? {} : { sender }),
            text: classified.text,
            kind: classified.kind,
            edited: classified.edited,
            ...(classified.mediaFileName ? { mediaFileName: classified.mediaFileName } : {}),
            ...(classified.latitude === undefined
                ? {}
                : { latitude: classified.latitude, longitude: classified.longitude }),
            lineNumber: current.lineNumber,
        });
        current = undefined;
    };

    for (const [index, line] of lines.entries()) {
        const header = headerPerLine[index];
        const month = dateOrder === 'MDY' ? header?.first : header?.second;
        const day = dateOrder === 'MDY' ? header?.second : header?.first;
        const validHeader =
            header !== undefined &&
            isValidDate(header.year, month!, day!) &&
            header.minute < 60 &&
            header.second_ < 60 &&
            toHour24(header.hour, header.meridiem) < 24;

        if (validHeader) {
            flush();
            const hour = toHour24(header.hour, header.meridiem);

            current = {
                header,
                lineNumber: index + 1,
                wallTime: `${pad(header.year, 4)}-${pad(month!)}-${pad(day!)}T${pad(hour)}:${pad(header.minute)}:${pad(header.second_)}`,
                body: [header.rest],
            };
        } else if (current) {
            current.body.push(line);
        } else if (line.trim()) {
            skippedLines++;
        }
    }

    flush();

    return {
        format: {
            style: candidate.style,
            dateSeparator: candidate.dateSeparator,
            dateOrder,
            hour12,
            dateOrderGuessed: guessed,
        },
        messages,
        skippedLines,
    };
}

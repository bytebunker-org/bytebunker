import { type HTMLElement, type Node, NodeType, parse } from 'node-html-parser';
import {
    GoogleMyActivityActionEnum,
    type GoogleMyActivityEntry,
    type GoogleMyActivityLink,
    type GoogleMyActivityLocation,
} from '@bytebunker/event-schema/extension/google-my-activity';
import { parseTakeoutTimestamp } from './takeout-timestamp.util.js';
import { GOOGLE_ACTIVITY_VERB_RULES } from './google-activity-verbs.constant.js';
import { parseGoogleMapsUrl } from './google-maps-url.util.js';

const OUTER_CELL_MARKER = '<div class="outer-cell';
const LINK_PLACEHOLDER = '{link}';
const PRODUCT_LABELS = new Set(['produkte', 'products']);
const LOCATION_LABELS = new Set(['standorte', 'locations']);
const WHY_LABELS = /^(warum steht das hier|why is this here)/i;
/** Payment amounts of Google Pay entries are not stored. */
const PAYMENT_DETAIL = /^(geschätzter betrag|betrag|estimated amount|amount)\b/i;
const YOUTUBE_VIDEO_URL = /^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/watch\?(?:.*&)?v=|^https?:\/\/youtu\.be\//;

export type GoogleActivitySkipReason = 'no-body' | 'no-timestamp' | 'unparseable';

export interface GoogleActivityParseResult {
    entries: GoogleMyActivityEntry[];
    /** Number of `.outer-cell` blocks in the file. */
    total: number;
    skipped: Partial<Record<GoogleActivitySkipReason, number>>;
}

export interface GoogleActivityParseOptions {
    /** Called every `progressInterval` blocks with the number of blocks done. */
    onProgress?: (done: number) => void;
    progressInterval?: number;
}

interface Segment {
    text: string;
    href?: string;
}

/**
 * Parses Takeout activity HTML: "My Activity" per product (`Meine Aktivitäten/<Produkt>/MeineAktivitäten.html`,
 * `My Activity/<Product>/MyActivity.html`) and the YouTube watch/search history, German or English.
 *
 * The files are one `.outer-cell` card per entry behind ~140 kB of inline CSS; the Search file of a long-lived
 * account is > 50 MB. Instead of one DOM for the whole file, each card is cut out of the string and parsed on its
 * own, so memory stays at the input string plus the result.
 */
export function parseGoogleActivityHtml(
    html: string,
    options: GoogleActivityParseOptions = {},
): GoogleActivityParseResult {
    const interval = options.progressInterval ?? 1000;
    const entries: GoogleMyActivityEntry[] = [];
    const skipped: GoogleActivityParseResult['skipped'] = {};
    let total = 0;

    for (const cellHtml of iterateActivityCells(html)) {
        total++;
        const result = parseActivityCell(cellHtml);

        if (typeof result === 'string') {
            skipped[result] = (skipped[result] ?? 0) + 1;
        } else {
            entries.push(result);
        }

        if (options.onProgress && total % interval === 0) {
            options.onProgress(total);
        }
    }

    return { entries, total, skipped };
}

/** Yields the HTML of each `.outer-cell` card without parsing the document. */
export function* iterateActivityCells(html: string): Generator<string> {
    let start = html.indexOf(OUTER_CELL_MARKER);

    while (start !== -1) {
        const next = html.indexOf(OUTER_CELL_MARKER, start + OUTER_CELL_MARKER.length);
        yield html.slice(start, next === -1 ? undefined : next);
        start = next;
    }
}

/** Parses one card; returns the skip reason if it is not a usable entry. */
export function parseActivityCell(cellHtml: string): GoogleMyActivityEntry | GoogleActivitySkipReason {
    let root: HTMLElement;

    try {
        root = parse(cellHtml);
    } catch {
        return 'unparseable';
    }

    const header = cleanText(root.querySelector('.header-cell .mdl-typography--title')?.text ?? '');
    const body = root
        .querySelectorAll('.content-cell.mdl-typography--body-1')
        .find((element) => !element.classList.contains('mdl-typography--text-right'));

    if (!body) {
        return 'no-body';
    }

    const attachmentFiles: string[] = [];
    const lines = splitLines(body, attachmentFiles);
    const timestampIndex = lines.findIndex((line) => parseTakeoutTimestamp(lineText(line)) !== undefined);

    if (timestampIndex === -1) {
        return 'no-timestamp';
    }

    const timestamp = parseTakeoutTimestamp(lineText(lines[timestampIndex]!))!;
    const actionLine = timestampIndex > 0 ? lines[0]! : [];
    const middleLines = lines.slice(1, timestampIndex);
    const trailingText = lines
        .slice(timestampIndex + 1)
        .map(lineText)
        .filter(Boolean)
        .join('\n');

    const allLinks = lines.slice(0, timestampIndex).flatMap((line) => line.filter((segment) => segment.href));
    const primary = actionLine.find((segment) => segment.href) ?? middleLines.flat().find((segment) => segment.href);

    const actionText = lineText(actionLine);
    const actionTemplate = lineText(
        actionLine.map((segment) => (segment === primary ? { text: LINK_PLACEHOLDER } : segment)),
    );
    const { action, subject } = classify(actionTemplate);
    const primaryTitle = primary ? cleanText(primary.text) : undefined;
    const title = primaryTitle || (subject && !subject.includes(LINK_PLACEHOLDER) ? subject : undefined);
    const url = primary?.href;

    const caption = parseCaption(root.querySelector('.content-cell.mdl-typography--caption'));
    const product = caption.products[0] ?? header;

    return {
        header,
        product,
        products: caption.products,
        action:
            action === GoogleMyActivityActionEnum.VIEWED && url && isYouTubeVideoUrl(url)
                ? GoogleMyActivityActionEnum.WATCHED
                : action,
        actionText,
        actionTemplate,
        ...(title ? { title } : {}),
        ...(url ? { url } : {}),
        secondaryLinks: allLinks
            .filter((segment) => segment !== primary)
            .map((segment): GoogleMyActivityLink => ({ text: cleanText(segment.text), url: segment.href! })),
        lines: middleLines.map(lineText).filter(Boolean),
        timestamp: timestamp.toISO()!,
        ...(trailingText ? { trailingText } : {}),
        locations: caption.locations,
        details: caption.details,
        attachmentFiles,
    };
}

/**
 * True if the file head looks like Takeout activity HTML (My Activity, YouTube watch/search history). The entries
 * start after ~140 kB of inline CSS, so the 64 kB detection sample usually holds only the title.
 */
export function looksLikeTakeoutActivityHtml(head: string): boolean {
    return (
        /<title>\s*(mein aktivitätsverlauf|my activity history|meine aktivitäten|my activity)\b/i.test(head) ||
        head.includes(OUTER_CELL_MARKER)
    );
}

export function isYouTubeVideoUrl(url: string): boolean {
    return YOUTUBE_VIDEO_URL.test(url);
}

function classify(template: string): { action: GoogleMyActivityActionEnum; subject?: string } {
    for (const rule of GOOGLE_ACTIVITY_VERB_RULES) {
        const match = rule.pattern.exec(template);

        if (match) {
            const subject = (match.groups?.['s'] ?? match.groups?.['s2'])?.trim();

            return { action: rule.action, ...(subject ? { subject } : {}) };
        }
    }

    return { action: GoogleMyActivityActionEnum.OTHER };
}

/**
 * Splits the body cell into lines at `<br>`. Links stay separate segments. Block elements (Gemini responses as
 * `<p>`/`<ul>`/...) become lines of their own; `<audio>`/local `<img>` files go to `attachmentFiles`.
 */
function splitLines(body: HTMLElement, attachmentFiles: string[]): Segment[][] {
    const lines: Segment[][] = [[]];
    const current = (): Segment[] => lines.at(-1)!;

    for (const node of body.childNodes) {
        if (node.nodeType === NodeType.TEXT_NODE) {
            current().push({ text: node.text });
            continue;
        }

        if (node.nodeType !== NodeType.ELEMENT_NODE) {
            continue;
        }

        const element = node as HTMLElement;
        const tag = element.tagName.toLowerCase();

        if (tag === 'br') {
            lines.push([]);
        } else if (tag === 'a') {
            const href = element.getAttribute('href');
            current().push(href ? { text: element.text, href } : { text: element.text });
        } else if (tag === 'audio' || tag === 'img') {
            collectFiles(element, attachmentFiles);
        } else {
            collectFiles(element, attachmentFiles);
            lines.push([{ text: element.structuredText }], []);
        }
    }

    // Drop leading empty lines (bodies starting with <br>).
    while (lines.length > 1 && !lineText(lines[0]!)) {
        lines.shift();
    }

    return lines;
}

function collectFiles(element: HTMLElement, attachmentFiles: string[]): void {
    const candidates = [element, ...element.querySelectorAll('source, img')];

    for (const candidate of candidates) {
        const src = candidate.getAttribute?.('src');

        if (src && !/^(https?:|data:)/i.test(src)) {
            attachmentFiles.push(src);
        }
    }
}

function parseCaption(caption: HTMLElement | null): {
    products: string[];
    locations: GoogleMyActivityLocation[];
    details: string[];
} {
    const products: string[] = [];
    const locations: GoogleMyActivityLocation[] = [];
    const details: string[] = [];

    if (!caption) {
        return { products, locations, details };
    }

    const sections: { label: string; lines: Segment[][] }[] = [];

    for (const node of caption.childNodes as Node[]) {
        const element = node.nodeType === NodeType.ELEMENT_NODE ? (node as HTMLElement) : undefined;
        const tag = element?.tagName.toLowerCase();

        if (tag === 'b') {
            sections.push({ label: cleanText(element!.text).replace(/:$/, ''), lines: [[]] });
            continue;
        }

        const section = sections.at(-1);

        if (!section) {
            continue;
        }

        if (tag === 'br') {
            section.lines.push([]);
        } else if (tag === 'a') {
            const href = element!.getAttribute('href');
            section.lines.at(-1)!.push(href ? { text: element!.text, href } : { text: element!.text });
        } else {
            section.lines.at(-1)!.push({ text: node.text });
        }
    }

    for (const { label, lines } of sections) {
        const key = label.toLowerCase();

        if (WHY_LABELS.test(label)) {
            continue;
        }

        const nonEmpty = lines.filter((line) => lineText(line));

        if (PRODUCT_LABELS.has(key)) {
            products.push(...nonEmpty.map(lineText));
        } else if (LOCATION_LABELS.has(key)) {
            locations.push(...nonEmpty.map(parseLocationLine));
        } else {
            for (const text of nonEmpty.map(lineText)) {
                if (!PAYMENT_DETAIL.test(text)) {
                    details.push(key === 'details' ? text : `${label}: ${text}`);
                }
            }
        }
    }

    return { products, locations, details };
}

function parseLocationLine(line: Segment[]): GoogleMyActivityLocation {
    const description = lineText(line);

    for (const segment of line) {
        const info = segment.href ? parseGoogleMapsUrl(segment.href) : undefined;

        if (info?.latitude !== undefined && info.longitude !== undefined) {
            const name = cleanText(segment.text);
            const isArea = /[&?]center=/.test(segment.href!) || info.kind === 'viewport';

            return {
                ...(name ? { name } : {}),
                description,
                latitude: info.latitude,
                longitude: info.longitude,
                precision: isArea ? 'area' : 'place',
                mapsUrl: segment.href!,
            };
        }
    }

    return { description };
}

function lineText(line: Segment[]): string {
    return cleanText(line.map((segment) => segment.text).join(''));
}

/** No-break, narrow and em spaces → plain space; collapses runs of spaces but keeps line breaks of free text. */
function cleanText(text: string): string {
    return text
        .replaceAll(/[^\S\n]+/g, ' ')
        .replaceAll(/ *\n */g, '\n')
        .trim();
}

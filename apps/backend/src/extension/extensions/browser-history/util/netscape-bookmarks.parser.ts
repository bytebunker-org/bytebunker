import type { BrowserBookmarkRecord } from '@bytebunker/event-schema/extension/browser-history';
import { WEBKIT_EPOCH_OFFSET_US } from './chrome-history.reader.js';

export const NETSCAPE_BOOKMARK_DOCTYPE = /<!doctype\s+netscape-bookmark-file-1>/i;

export interface NetscapeBookmarksParseResult {
    bookmarks: BrowserBookmarkRecord[];
    /** Links without HREF or ADD_DATE. */
    invalid: number;
}

const TOKEN_PATTERN = /<h3\b([^>]*)>([\S\s]*?)<\/h3>|<a\b([^>]*)>([\S\s]*?)<\/a>|<dl\b[^>]*>|<\/dl>/gi;
const ATTRIBUTE_PATTERN = /([\w-]+)\s*=\s*"([^"]*)"/g;
const MAX_CODE_POINT = 1_114_111;
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeHtmlEntities(text: string): string {
    return text.replaceAll(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
        if (entity[0] === '#') {
            const codePoint =
                entity[1].toLowerCase() === 'x'
                    ? Number.parseInt(entity.slice(2), 16)
                    : Number.parseInt(entity.slice(1), 10);

            return Number.isFinite(codePoint) && codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : match;
        }

        return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
}

function parseAttributes(raw: string): Record<string, string> {
    const attributes: Record<string, string> = {};

    for (const [, name, value] of raw.matchAll(ATTRIBUTE_PATTERN)) {
        attributes[name.toUpperCase()] = value;
    }

    return attributes;
}

function textContent(html: string): string {
    return decodeHtmlEntities(html.replaceAll(/<[^>]*>/g, '')).trim();
}

/**
 * ADD_DATE comes in several units: Unix seconds (Chrome and Firefox exports), but older Chrome exports wrote WebKit
 * microseconds (since 1601), and some tools write milliseconds or Unix microseconds. Returns Unix microseconds.
 */
export function netscapeDateToUnixUs(raw: string | undefined): number | undefined {
    const value = Number(raw);

    if (!raw || !Number.isFinite(value) || value <= 0) {
        return undefined;
    }

    if (value >= 1e16) {
        return value - WEBKIT_EPOCH_OFFSET_US;
    }

    if (value >= 1e14) {
        return value;
    }

    return value >= 1e11 ? value * 1000 : value * 1_000_000;
}

/**
 * Parses a Netscape bookmark file (Chrome Takeout `Lesezeichen.html`/`Bookmarks.html`, Chrome and Firefox HTML
 * exports, `Leseliste.html`). The format is not well-formed HTML (unclosed `<DT>`/`<p>`), so it is tokenised: an
 * `<H3>` names the folder whose `<DL>` follows, `</DL>` closes it.
 */
export function parseNetscapeBookmarks(html: string): NetscapeBookmarksParseResult {
    const bookmarks: BrowserBookmarkRecord[] = [];
    const folderStack: (string | null)[] = [];
    let pendingFolder: string | null = null;
    let invalid = 0;

    for (const match of html.matchAll(TOKEN_PATTERN)) {
        const [token, , folderName, linkAttributes, linkText] = match;

        if (folderName !== undefined) {
            pendingFolder = textContent(folderName);
        } else if (linkAttributes !== undefined) {
            const attributes = parseAttributes(linkAttributes);
            const url = attributes['HREF'] ? decodeHtmlEntities(attributes['HREF']) : undefined;
            const dateAddedUs = netscapeDateToUnixUs(attributes['ADD_DATE']);

            if (!url || !dateAddedUs) {
                invalid++;
                continue;
            }

            const title = textContent(linkText);
            const lastModifiedUs = netscapeDateToUnixUs(attributes['LAST_MODIFIED']);
            const keyword = attributes['SHORTCUTURL'] ? decodeHtmlEntities(attributes['SHORTCUTURL']) : undefined;
            const tags = attributes['TAGS']
                ? decodeHtmlEntities(attributes['TAGS'])
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                : [];

            bookmarks.push({
                url,
                ...(title ? { title } : {}),
                dateAddedUs,
                ...(lastModifiedUs ? { lastModifiedUs } : {}),
                folderPath: folderStack.filter(Boolean),
                ...(keyword ? { keyword } : {}),
                ...(tags.length ? { tags } : {}),
            });
        } else if (token[1] === '/') {
            folderStack.pop();
        } else {
            folderStack.push(pendingFolder);
            pendingFolder = null;
        }
    }

    return { bookmarks, invalid };
}

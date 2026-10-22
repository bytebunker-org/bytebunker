import { createHash } from 'node:crypto';

/**
 * Schemes worth keeping. Everything else is browser-internal (about:, chrome://, moz-extension:, place:, view-source:,
 * javascript: bookmarklets, data:, blob:) and is skipped. `file:` is kept: those are local documents (PDFs, HTML
 * reports) the user opened, and they say something about what was read even if the link only resolves on that machine.
 */
const KEPT_PROTOCOLS = new Set(['http:', 'https:', 'ftp:', 'file:']);

/** Room left for prefix and suffix under the stable-key index limit of 512 characters. */
const MAX_INLINE_URL_LENGTH = 440;
const TRUNCATED_URL_PREFIX_LENGTH = 360;

/**
 * Normalises a URL for identity: WHATWG parsing lower-cases scheme and host, applies IDNA, drops default ports and
 * normalises percent-encoding of the path. Query and fragment are kept (hash-routed apps put the page in the fragment);
 * only an empty trailing `#` is removed. Returns undefined for unparseable and browser-internal URLs.
 */
export function normalizePageUrl(rawUrl: string | null | undefined): string | undefined {
    if (!rawUrl) {
        return undefined;
    }

    let url: URL;

    try {
        url = new URL(rawUrl.trim());
    } catch {
        return undefined;
    }

    if (!KEPT_PROTOCOLS.has(url.protocol)) {
        return undefined;
    }

    const href = url.href;

    return href.endsWith('#') ? href.slice(0, -1) : href;
}

/**
 * Builds `<prefix><url><suffix>` as stable key. URLs too long for the 512 character key index are shortened to a
 * prefix plus a SHA-256 of the full URL, so two long URLs sharing their first characters never share a key.
 */
export function urlStableKey(prefix: string, url: string, suffix = ''): string {
    if (url.length <= MAX_INLINE_URL_LENGTH) {
        return `${prefix}${url}${suffix}`;
    }

    const digest = createHash('sha256').update(url).digest('hex').slice(0, 32);

    return `${prefix}${url.slice(0, TRUNCATED_URL_PREFIX_LENGTH)}…sha256:${digest}${suffix}`;
}

/** Identity of a web page node, shared by every importer that references pages. */
export function pageStableKey(normalizedUrl: string): string {
    return urlStableKey('page:', normalizedUrl);
}

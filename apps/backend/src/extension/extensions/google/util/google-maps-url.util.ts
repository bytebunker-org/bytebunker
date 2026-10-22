export interface GoogleMapsUrlInfo {
    /**
     * `place`: a place page or feature id, `viewport`: a viewed map region (`/maps/@lat,lng,…`), `point`: a bare
     * coordinate (`center=`/`query=`), `search`: a search results page, `directions`: a route.
     */
    kind: 'place' | 'viewport' | 'point' | 'search' | 'directions';
    latitude?: number;
    longitude?: number;
    /** Maps feature id like `0x47957b663828e899:0x81db0419a0f3bd5b` (`ftid=` or `!1s…` in the data part). */
    featureId?: string;
    /** Place name from `/maps/place/<name>/` or `?q=`. */
    name?: string;
}

const COORDINATE_PAIR = /^(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/;
const FEATURE_ID = /(0x[\da-f]+:0x[\da-f]+)/i;

/** Recognises Google Maps links of Takeout activity HTML; undefined for any other URL. */
export function parseGoogleMapsUrl(rawUrl: string): GoogleMapsUrlInfo | undefined {
    let url: URL;

    try {
        url = new URL(rawUrl);
    } catch {
        return undefined;
    }

    const isMapsHost = /(^|\.)google\.[.a-z]+$/i.test(url.hostname) || /^maps\.google\./i.test(url.hostname);

    if (!isMapsHost || !(url.pathname.startsWith('/maps') || /^maps\.google\./i.test(url.hostname))) {
        return undefined;
    }

    const params = url.searchParams;
    const decodedPath = safeDecode(url.pathname);
    const at = /\/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(decodedPath);
    const coordinates = at ? { latitude: Number(at[1]), longitude: Number(at[2]) } : {};
    const featureId = (params.get('ftid') ?? FEATURE_ID.exec(decodedPath)?.[1])?.toLowerCase();

    for (const key of ['center', 'query', 'q']) {
        const pair = COORDINATE_PAIR.exec(params.get(key) ?? '');

        if (pair) {
            return { kind: 'point', latitude: Number(pair[1]), longitude: Number(pair[2]) };
        }
    }

    if (decodedPath.startsWith('/maps/dir')) {
        return { kind: 'directions', ...coordinates, ...(featureId ? { featureId } : {}) };
    }

    if (decodedPath.startsWith('/maps/search')) {
        return { kind: 'search', ...coordinates };
    }

    const placeName = /^\/maps\/place\/([^/]*)/.exec(decodedPath)?.[1]?.replace(/\+/g, ' ').trim();

    if (decodedPath.startsWith('/maps/place')) {
        return {
            kind: 'place',
            ...coordinates,
            ...(featureId ? { featureId } : {}),
            ...(placeName ? { name: placeName } : {}),
        };
    }

    if (featureId) {
        const name = params.get('q')?.trim();

        return { kind: 'place', featureId, ...(name ? { name } : {}) };
    }

    if (at) {
        return { kind: 'viewport', ...coordinates };
    }

    return undefined;
}

function safeDecode(path: string): string {
    try {
        return decodeURIComponent(path);
    } catch {
        return path;
    }
}

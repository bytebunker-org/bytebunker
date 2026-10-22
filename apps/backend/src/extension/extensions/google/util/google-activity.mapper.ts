import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import type { ASObject, Audio, Note, Place } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import {
    GoogleMyActivityActionEnum as Action,
    type GoogleMyActivityEntry,
} from '@bytebunker/event-schema/extension/google-my-activity';
import { YouTubeProductEnum, type YouTubeWatchEntry } from '@bytebunker/event-schema/extension/youtube';
import type { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import {
    buildYouTubeListenActivity,
    buildYouTubeVideoObject,
    buildYouTubeViewActivity,
    extractYouTubeChannelId,
    extractYouTubeVideoId,
} from '../../youtube/util/youtube-activity.builder.js';
import { isYouTubeVideoUrl } from './google-activity-html.parser.js';
import { type GoogleMapsUrlInfo, parseGoogleMapsUrl } from './google-maps-url.util.js';
import type { GoogleMyActivityActivityInterface } from '../type/google-my-activity-activity.interface.js';

type ActivityRecord = Record<string, unknown> & { '@type': string; stableKeys: string[] };

const SEARCH_ACTIONS = new Set([Action.SEARCHED, Action.SAID, Action.DEFINED, Action.DIRECTIONS]);
const LISTEN_ACTIONS = new Set([Action.LISTENED, Action.SKIPPED]);
/** Actions whose free-text subject (no link) names an app or feature worth a Page node. */
const APP_ACTIONS = new Set([
    Action.USED,
    Action.OPENED,
    Action.INSTALLED,
    Action.UNINSTALLED,
    Action.JOINED_BETA,
    Action.PURCHASE_STARTED,
]);
const YOUTUBE_PRODUCTS = new Set(['YouTube', 'YouTube Music']);
/** Below the 512 character limit of the stable key index. */
const MAX_OBJECT_KEY_LENGTH = 400;

/**
 * Turns parsed "My Activity" entries into activities:
 * - searched/said/defined/directions → `Search` (`query`, `pageUrl` of the results page, caption location);
 * - prompted (Gemini) → `Create` of a `Note` with the prompt, the response as `responseText`;
 * - watched in the YouTube product → the same `View`/`Listen` the watch history import builds (shared keys);
 * - listened/skipped → `Listen` of an `Audio`;
 * - everything else → `View` with `action`, object `Place` (Maps links), `Video` (YouTube links), `Page` (other
 *   links, or the app/feature named by a used/installed/... entry) or none.
 * Every activity carries `GoogleMyActivity` as secondary type, the product and the raw action text.
 */
export class GoogleActivityMapper {
    constructor(
        private readonly stableKeyService: ActivityStableKeyService,
        private readonly generator: ASObject,
        private readonly actorId: string,
    ) {}

    public map(entry: GoogleMyActivityEntry): ActivityRecord | undefined {
        const startTime = DateTime.fromISO(entry.timestamp, { setZone: true });

        if (!startTime.isValid) {
            return undefined;
        }

        const identityKey = googleActivityIdentityKey(entry, startTime);
        const common = this.commonProperties(entry);

        if (entry.action === Action.WATCHED && entry.url && YOUTUBE_PRODUCTS.has(entry.product)) {
            const youTube = this.mapYouTubeWatch(entry, startTime);

            if (youTube) {
                return {
                    ...youTube,
                    ...common,
                    '@secondaryTypes': [...((youTube['@secondaryTypes'] as string[]) ?? []), 'GoogleMyActivity'],
                    stableKeys: [identityKey, ...youTube.stableKeys],
                };
            }
        }

        const base = {
            '@secondaryTypes': [createUnknownASType('GoogleMyActivity')],
            generator: this.generator,
            stableKeys: [identityKey],
            actor: { '@id': this.actorId, '@type': 'Person' },
            startTime,
            ...common,
        };
        const location = this.captionPlace(entry);

        if (SEARCH_ACTIONS.has(entry.action)) {
            const object = this.mapsObject(entry);

            return {
                ...base,
                '@type': createUnknownASType('Search'),
                ...(entry.title ? { query: entry.title } : {}),
                ...(entry.url ? { pageUrl: entry.url } : {}),
                ...(entry.action === Action.DIRECTIONS ? directions(entry) : {}),
                ...(object ? { object } : {}),
                ...(location ? { location } : {}),
            };
        }

        if (entry.action === Action.PROMPTED) {
            const note: Note = {
                '@type': 'Note',
                stableKeys: [`${identityKey}:note`],
                content: entry.title ?? '',
            };

            return {
                ...base,
                '@type': 'Create',
                object: note,
                ...(entry.trailingText ? { responseText: entry.trailingText } : {}),
                ...(location ? { location } : {}),
            };
        }

        if (LISTEN_ACTIONS.has(entry.action)) {
            const object = this.audioObject(entry);

            return {
                ...base,
                '@type': 'Listen',
                ...(object ? { object } : {}),
                ...(location ? { location } : {}),
            };
        }

        const object = this.viewObject(entry);

        return {
            ...base,
            '@type': 'View',
            ...(object ? { object } : {}),
            ...(location ? { location } : {}),
        };
    }

    private commonProperties(entry: GoogleMyActivityEntry): GoogleMyActivityActivityInterface {
        return {
            googleProduct: entry.product,
            ...(entry.header === entry.product ? {} : { googleHeader: entry.header }),
            ...(entry.products.length > 1 ? { googleProducts: entry.products } : {}),
            action: entry.action,
            actionText: entry.actionText,
            ...(entry.title ? { title: entry.title } : {}),
            ...(entry.lines.length ? { lines: entry.lines } : {}),
            ...(entry.secondaryLinks.length ? { secondaryLinks: entry.secondaryLinks } : {}),
            ...(entry.locations.length ? { locations: entry.locations } : {}),
            ...(entry.details.length ? { details: entry.details } : {}),
            ...(entry.attachmentFiles.length ? { attachmentFiles: entry.attachmentFiles } : {}),
        };
    }

    private mapYouTubeWatch(entry: GoogleMyActivityEntry, watchedAt: DateTime<true>): ActivityRecord | undefined {
        const videoId = extractYouTubeVideoId(entry.url!);

        if (!videoId) {
            return undefined;
        }

        const channel = entry.secondaryLinks.find((link) => extractYouTubeChannelId(link.url));
        const watchEntry: YouTubeWatchEntry = {
            product: entry.header === 'YouTube Music' ? YouTubeProductEnum.YOUTUBE_MUSIC : YouTubeProductEnum.YOUTUBE,
            videoId,
            videoUrl: entry.url!,
            title: entry.title ?? '',
            ...(channel
                ? {
                      channelName: channel.text,
                      channelId: extractYouTubeChannelId(channel.url)!,
                      channelUrl: channel.url,
                  }
                : {}),
            watchedAt: entry.timestamp,
        };
        const context = { stableKeyService: this.stableKeyService, generator: this.generator, actorId: this.actorId };
        const activity =
            watchEntry.product === YouTubeProductEnum.YOUTUBE_MUSIC
                ? buildYouTubeListenActivity(watchEntry, watchedAt, context)
                : buildYouTubeViewActivity(watchEntry, watchedAt, context);

        return activity as unknown as ActivityRecord;
    }

    private viewObject(entry: GoogleMyActivityEntry): ASObject | undefined {
        if (entry.url) {
            const maps = this.mapsObject(entry);

            if (maps) {
                return maps;
            }

            const videoId = isYouTubeVideoUrl(entry.url) ? extractYouTubeVideoId(entry.url) : undefined;

            if (videoId) {
                return buildYouTubeVideoObject(this.stableKeyService, {
                    videoId,
                    videoUrl: entry.url,
                    ...(entry.title ? { title: entry.title } : {}),
                });
            }

            return this.page(unwrapGoogleRedirect(entry.url), entry.title);
        }

        if (entry.title && APP_ACTIONS.has(entry.action)) {
            return {
                '@type': 'Page',
                stableKeys: [
                    this.objectKey('Page', {
                        googleProduct: entry.product,
                        name: entry.title,
                    }),
                ],
                name: entry.title,
            };
        }

        return undefined;
    }

    private page(pageUrl: string, title: string | undefined): ASObject {
        const packageName = /^https:\/\/play\.google\.com\/store\/apps\/details\?(?:.*&)?id=([^#&]+)/.exec(
            pageUrl,
        )?.[1];

        return {
            '@type': 'Page',
            stableKeys: [this.objectKey('Page', { pageUrl })],
            ...(title ? { name: title } : {}),
            pageUrl,
            ...(packageName ? { packageName } : {}),
        } as ASObject;
    }

    /** Place of a Maps link (place page, feature id or viewed region); undefined for other links. */
    private mapsObject(entry: GoogleMyActivityEntry): Place | undefined {
        const info = entry.url ? parseGoogleMapsUrl(entry.url) : undefined;

        if (!info || !(info.kind === 'place' || info.kind === 'viewport' || info.kind === 'point')) {
            return undefined;
        }

        return this.place(info, entry.title, entry.url!);
    }

    private place(info: GoogleMapsUrlInfo, title: string | undefined, mapsUrl: string): Place | undefined {
        const hasCoordinates = info.latitude !== undefined && info.longitude !== undefined;

        if (!info.featureId && !hasCoordinates) {
            return undefined;
        }

        const name = info.name || title;

        return {
            '@type': 'Place',
            stableKeys: [
                info.featureId
                    ? this.objectKey('Place', { googleFeatureId: info.featureId })
                    : this.objectKey('Place', {
                          lat: info.latitude!,
                          lng: info.longitude!,
                          ...(name ? { name } : {}),
                      }),
            ],
            ...(name ? { name } : {}),
            ...(hasCoordinates ? { latitude: info.latitude, longitude: info.longitude } : {}),
            ...(info.featureId ? { googleFeatureId: info.featureId } : {}),
            mapsUrl,
        } as Place;
    }

    /** First caption location with coordinates ("Standorte:/Locations:"). */
    private captionPlace(entry: GoogleMyActivityEntry): Place | undefined {
        const location = entry.locations.find((l) => l.latitude !== undefined && l.longitude !== undefined);

        if (!location) {
            return undefined;
        }

        return {
            '@type': 'Place',
            stableKeys: [
                this.objectKey('Place', {
                    lat: location.latitude!,
                    lng: location.longitude!,
                    precision: location.precision,
                }),
            ],
            ...(location.name ? { name: location.name } : {}),
            latitude: location.latitude,
            longitude: location.longitude,
            ...(location.precision ? { precision: location.precision } : {}),
        } as Place;
    }

    /** Object key; keys over the index limit (long URLs, translated text) become a SHA-256 of the same data. */
    private objectKey(type: 'Page' | 'Place' | 'Audio', data: Record<string, unknown>): string {
        const key = this.stableKeyService.createASObjectStableKey(type, data);

        if (key.length <= MAX_OBJECT_KEY_LENGTH) {
            return key;
        }

        return this.stableKeyService.createASObjectStableKey(type, {
            sha256: createHash('sha256').update(key).digest('hex'),
        });
    }

    private audioObject(entry: GoogleMyActivityEntry): Audio | undefined {
        if (!entry.title) {
            return undefined;
        }

        // Play Music and song search put the artist on the line after the title.
        const byArtist = entry.lines[0];

        return {
            '@type': 'Audio',
            '@secondaryTypes': [createUnknownASType('MusicRecording')],
            stableKeys: [
                this.objectKey('Audio', {
                    name: entry.title,
                    ...(byArtist ? { byArtist } : {}),
                }),
            ],
            name: entry.title,
            ...(byArtist ? { byArtist } : {}),
        } as Audio;
    }
}

export interface GoogleActivityMapResult {
    activities: ActivityRecord[];
    /** Entries the export lists more than once with identical content (same identity key). */
    duplicates: number;
    /** Entries without a valid timestamp. */
    unmapped: number;
    byAction: Record<string, number>;
}

/** Maps all entries, dropping repeated identical entries so they do not become duplicate nodes. */
export function mapGoogleActivityEntries(
    mapper: GoogleActivityMapper,
    entries: GoogleMyActivityEntry[],
): GoogleActivityMapResult {
    const result: GoogleActivityMapResult = { activities: [], duplicates: 0, unmapped: 0, byAction: {} };
    const seenKeys = new Set<string>();

    for (const entry of entries) {
        const activity = mapper.map(entry);

        if (!activity) {
            result.unmapped++;
            continue;
        }

        const identityKey = activity.stableKeys[0]!;

        if (seenKeys.has(identityKey)) {
            result.duplicates++;
            continue;
        }

        seenKeys.add(identityKey);
        result.byAction[entry.action] = (result.byAction[entry.action] ?? 0) + 1;
        result.activities.push(activity);
    }

    return result;
}

/**
 * `google-activity:<product>:<UTC time to the second>:<hash>`; the hash covers the action line, title, link, the
 * further body lines and the details, so entries of the same second (map views, app usage bursts) stay apart.
 */
export function googleActivityIdentityKey(entry: GoogleMyActivityEntry, startTime: DateTime<true>): string {
    const hash = createHash('sha256')
        .update(JSON.stringify([entry.actionTemplate, entry.title ?? '', entry.url ?? '', entry.lines, entry.details]))
        .digest('hex')
        .slice(0, 16);

    return `google-activity:${entry.product}:${startTime.toUTC().toISO({ suppressMilliseconds: true })}:${hash}`;
}

/** Route stops of a "Route nach …/Directions to …" entry: the lines after the action, origin first. */
function directions(entry: GoogleMyActivityEntry): Record<string, unknown> {
    const stops = entry.lines;

    return {
        ...(stops.length >= 2 ? { originName: stops[0] } : {}),
        destinationName: stops.length >= 2 ? stops.at(-1) : (entry.title ?? stops[0]),
        ...(stops.length > 2 ? { waypointNames: stops.slice(1, -1) } : {}),
    };
}

/** `https://www.google.com/url?q=<target>&usg=…` → `<target>`. */
export function unwrapGoogleRedirect(url: string): string {
    const match = /^https?:\/\/(?:www\.)?google\.[.a-z]+\/url\?(.*)$/.exec(url);

    if (!match) {
        return url;
    }

    const params = new URLSearchParams(match[1]);

    return params.get('q') ?? params.get('url') ?? url;
}

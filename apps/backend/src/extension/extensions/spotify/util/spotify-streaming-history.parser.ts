import { DateTime } from 'luxon';
import type { SpotifyStreamingHistoryRow } from '@bytebunker/event-schema/extension/spotify';

export type SpotifyPlayKind = 'track' | 'episode' | 'audiobook' | 'unknown';

export type SpotifySkipReason = 'not-an-object' | 'invalid-ts' | 'invalid-ms-played';

/** A validated row with normalised values; `null`/empty fields are dropped. */
export interface SpotifyPlay {
    kind: SpotifyPlayKind;
    /** The track, episode or audiobook chapter URI, if the row has one. */
    uri?: string;
    /** Identity of this play, see {@link buildBasePlayKey}. Unique within one parse result. */
    playKey: string;
    startTime: DateTime<true>;
    /** `ts`: Spotify logs when playback ended. */
    endTime: DateTime<true>;
    msPlayed: number;

    trackName?: string;
    artistName?: string;
    albumName?: string;
    episodeName?: string;
    showName?: string;
    audiobookTitle?: string;
    audiobookUri?: string;
    audiobookChapterTitle?: string;

    platform?: string;
    connCountry?: string;
    /** `ip_addr` as logged by Spotify. Ignored for duplicate detection (Spotify repeats rows with another IP). */
    ipAddress?: string;
    reasonStart?: string;
    reasonEnd?: string;
    shuffle?: boolean;
    skipped?: boolean;
    offline?: boolean;
    /** `offline_timestamp` as ISO 8601 (UTC). */
    offlineTimestamp?: string;
    incognitoMode?: boolean;
}

export interface SpotifyStreamingHistoryParseResult {
    plays: SpotifyPlay[];
    rowCount: number;
    /** Rows that could not be read, by reason. */
    skipped: Partial<Record<SpotifySkipReason, number>>;
    /** Rows identical (apart from the IP address) to an earlier row of the file; Spotify repeats some rows. */
    duplicateRows: number;
}

/** `offline_timestamp` values above this are milliseconds (older exports), below seconds. */
const OFFLINE_TIMESTAMP_MS_THRESHOLD = 1e11;

/**
 * Parses one Extended Streaming History file. Throws only if the file is not a JSON array; rows that cannot be
 * read are skipped and counted.
 */
export function parseSpotifyStreamingHistory(json: string): SpotifyStreamingHistoryParseResult {
    const data: unknown = JSON.parse(json);

    if (!Array.isArray(data)) {
        throw new TypeError('Spotify streaming history must be a JSON array of plays');
    }

    const plays: SpotifyPlay[] = [];
    const skipped: SpotifyStreamingHistoryParseResult['skipped'] = {};
    // Distinct rows (by content hash) seen per base key, so repeated rows collapse and different plays sharing a key
    // get an ordinal. Hashes instead of the row JSON keep memory flat for 200k+ rows; the base key already pins end
    // time, item and duration, so a collision inside one group is not a practical concern.
    const fingerprintsByBaseKey = new Map<string, number[]>();
    let duplicateRows = 0;

    for (const row of data) {
        const result = normalizeSpotifyRow(row);

        if (typeof result === 'string') {
            skipped[result] = (skipped[result] ?? 0) + 1;
            continue;
        }

        const baseKey = buildBasePlayKey(result);
        const { ipAddress: _ipAddress, ...comparable } = result;
        const fingerprint = hashString(JSON.stringify(comparable));
        const fingerprints = fingerprintsByBaseKey.get(baseKey) ?? [];

        if (fingerprints.includes(fingerprint)) {
            duplicateRows++;
            continue;
        }

        fingerprints.push(fingerprint);
        fingerprintsByBaseKey.set(baseKey, fingerprints);

        plays.push({
            ...result,
            playKey: fingerprints.length === 1 ? baseKey : `${baseKey}#${fingerprints.length}`,
        });
    }

    return { plays, rowCount: data.length, skipped, duplicateRows };
}

/**
 * Validates and normalises one raw row. Returns the reason as a string if the row cannot be used.
 */
export function normalizeSpotifyRow(row: unknown): Omit<SpotifyPlay, 'playKey'> | SpotifySkipReason {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return 'not-an-object';
    }

    const raw = row as Partial<Record<keyof SpotifyStreamingHistoryRow, unknown>>;
    const endTime = typeof raw.ts === 'string' ? DateTime.fromISO(raw.ts, { zone: 'utc' }) : undefined;

    if (!endTime?.isValid) {
        return 'invalid-ts';
    }

    const msPlayed = raw.ms_played;

    if (typeof msPlayed !== 'number' || !Number.isFinite(msPlayed) || msPlayed < 0) {
        return 'invalid-ms-played';
    }

    const trackUri = text(raw.spotify_track_uri);
    const episodeUri = text(raw.spotify_episode_uri);
    const audiobookUri = text(raw.audiobook_uri);
    const audiobookChapterUri = text(raw.audiobook_chapter_uri);
    const kind: SpotifyPlayKind = trackUri
        ? 'track'
        : episodeUri
          ? 'episode'
          : audiobookChapterUri || audiobookUri
            ? 'audiobook'
            : 'unknown';
    const uri = trackUri ?? episodeUri ?? audiobookChapterUri ?? audiobookUri;
    const play: Omit<SpotifyPlay, 'playKey'> = {
        kind,
        ...(uri ? { uri } : {}),
        startTime: endTime.minus({ milliseconds: msPlayed }),
        endTime,
        msPlayed,
    };

    if (kind === 'track') {
        assign(play, 'trackName', text(raw.master_metadata_track_name));
        assign(play, 'artistName', text(raw.master_metadata_album_artist_name));
        assign(play, 'albumName', text(raw.master_metadata_album_album_name));
    } else if (kind === 'episode') {
        assign(play, 'episodeName', text(raw.episode_name));
        assign(play, 'showName', text(raw.episode_show_name));
    } else if (kind === 'audiobook') {
        assign(play, 'audiobookTitle', text(raw.audiobook_title));
        assign(play, 'audiobookUri', audiobookUri);
        assign(play, 'audiobookChapterTitle', text(raw.audiobook_chapter_title));
    }

    assign(play, 'platform', text(raw.platform));
    assign(play, 'connCountry', text(raw.conn_country));
    assign(play, 'ipAddress', text(raw.ip_addr));
    assign(play, 'reasonStart', text(raw.reason_start));
    assign(play, 'reasonEnd', text(raw.reason_end));
    assign(play, 'shuffle', bool(raw.shuffle));
    assign(play, 'skipped', bool(raw.skipped));
    assign(play, 'offline', bool(raw.offline));
    assign(play, 'offlineTimestamp', offlineTimestamp(raw.offline_timestamp));
    assign(play, 'incognitoMode', bool(raw.incognito_mode));

    return play;
}

/**
 * `spotify:play:<end ISO>:<uri>:<ms played>`, i.e. what played from when to when. `ts` alone is only second-precise:
 * skipping through a queue, or a batch of offline plays synced at once, logs several plays of the same item in one
 * second (729 such groups in a 241k-row history), and two of them span neighbouring files. With the duration the
 * key separates those; the remaining distinct plays that share it get `#2`, `#3`… in file order.
 * Rows without any URI (rare video rows) use the platform instead.
 */
export function buildBasePlayKey(play: Pick<SpotifyPlay, 'uri' | 'endTime' | 'msPlayed' | 'platform'>): string {
    const end = play.endTime.toUTC().toISO({ suppressMilliseconds: true });
    const item = play.uri ?? `unknown:${play.platform ?? 'unknown-platform'}`;

    return `spotify:play:${end}:${item}:${play.msPlayed}`;
}

function text(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function bool(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function offlineTimestamp(value: unknown): string | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return undefined;
    }

    const millis = value > OFFLINE_TIMESTAMP_MS_THRESHOLD ? value : value * 1000;
    const dateTime = DateTime.fromMillis(millis, { zone: 'utc' });

    return dateTime.isValid ? (dateTime.toISO({ suppressMilliseconds: true }) ?? undefined) : undefined;
}

function assign<K extends keyof SpotifyPlay>(target: Partial<SpotifyPlay>, key: K, value: SpotifyPlay[K] | undefined) {
    if (value !== undefined) {
        target[key] = value;
    }
}

/** FNV-1a, 32 bit. */
function hashString(value: string): number {
    let hash = 0x811c9dc5;

    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
}

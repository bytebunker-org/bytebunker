/**
 * One row of Spotify's Extended Streaming History (`Streaming_History_Audio_*.json`, `Streaming_History_Video_*.json`).
 * Every row carries all keys; the ones that don't apply are null. Exactly one of the track, episode and audiobook
 * chapter URIs is set on a valid row.
 */
export interface SpotifyStreamingHistoryEntry {
    /** When playback **ended**, UTC, e.g. `2021-06-21T17:18:03Z`. */
    ts?: string | null;
    platform?: string | null;
    ms_played?: number | null;
    conn_country?: string | null;
    ip_addr?: string | null;
    master_metadata_track_name?: string | null;
    master_metadata_album_artist_name?: string | null;
    master_metadata_album_album_name?: string | null;
    /** `spotify:track:<base62>` */
    spotify_track_uri?: string | null;
    episode_name?: string | null;
    episode_show_name?: string | null;
    /** `spotify:episode:<base62>` */
    spotify_episode_uri?: string | null;
    audiobook_title?: string | null;
    /** `spotify:show:<base62>` */
    audiobook_uri?: string | null;
    /** `spotify:episode:<base62>` */
    audiobook_chapter_uri?: string | null;
    audiobook_chapter_title?: string | null;
    reason_start?: string | null;
    reason_end?: string | null;
    shuffle?: boolean | null;
    skipped?: boolean | null;
    offline?: boolean | null;
    /** Unix time (seconds, in older exports milliseconds) when offline mode was used. */
    offline_timestamp?: number | null;
    incognito_mode?: boolean | null;
}

export type SpotifyContentType = 'track' | 'episode' | 'audiobookChapter';

export enum SpotifySkipReasonEnum {
    NOT_AN_OBJECT = 'notAnObject',
    INVALID_TIMESTAMP = 'invalidTimestamp',
    INVALID_MS_PLAYED = 'invalidMsPlayed',
    NO_CONTENT_URI = 'noContentUri',
    /** Same end second and URI as an earlier row: the same play logged twice, merged into one activity. */
    DUPLICATE_ROW = 'duplicateRow',
}

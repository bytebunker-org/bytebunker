/**
 * One row of a Spotify Extended Streaming History export (`Streaming_History_Audio_*.json`,
 * `Streaming_History_Video_*.json`). Every row carries every field; the ones that do not apply are `null`.
 */
export interface SpotifyStreamingHistoryRow {
    /** When playback **ended**, UTC, e.g. `2021-06-21T17:18:03Z`. */
    ts: string;

    /** Client platform, e.g. `android`, `Linux [x86-64 0]`, `Android OS 11 API 30 (LGE, LM-G900)`. */
    platform: string | null;

    /** How long the item played, in milliseconds. */
    ms_played: number;

    /** ISO 3166 country code of the connection, `ZZ` if unknown. */
    conn_country: string | null;

    /** IP address of the client. Never imported. */
    ip_addr?: string | null;

    master_metadata_track_name: string | null;
    master_metadata_album_artist_name: string | null;
    master_metadata_album_album_name: string | null;
    /** `spotify:track:<base62>` */
    spotify_track_uri: string | null;

    episode_name: string | null;
    episode_show_name: string | null;
    /** `spotify:episode:<base62>` */
    spotify_episode_uri: string | null;

    audiobook_title: string | null;
    /** URI of the whole audiobook (`spotify:show:…` or `spotify:audiobook:…`). */
    audiobook_uri: string | null;
    /** URI of the chapter (`spotify:episode:…` or `spotify:chapter:…`). */
    audiobook_chapter_uri: string | null;
    audiobook_chapter_title: string | null;

    /** Why playback started, e.g. `trackdone`, `clickrow`, `fwdbtn`. */
    reason_start: string | null;
    /** Why playback ended, e.g. `trackdone`, `endplay`, `fwdbtn`. */
    reason_end: string | null;

    shuffle: boolean | null;
    skipped: boolean | null;
    offline: boolean | null;
    /** Unix time of the offline play, seconds in newer exports, milliseconds in older ones. */
    offline_timestamp: number | null;
    /** Private session. */
    incognito_mode: boolean | null;
}

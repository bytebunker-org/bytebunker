import type { SpotifyStreamingHistoryRow } from '@bytebunker/event-schema/extension/spotify';

/** Synthetic rows shaped like Spotify's Extended Streaming History; names, URIs and IPs are made up. */
const EMPTY_ROW: SpotifyStreamingHistoryRow = {
    ts: '2024-01-01T00:00:00Z',
    platform: 'android',
    ms_played: 0,
    conn_country: 'DE',
    ip_addr: '192.0.2.10',
    master_metadata_track_name: null,
    master_metadata_album_artist_name: null,
    master_metadata_album_album_name: null,
    spotify_track_uri: null,
    episode_name: null,
    episode_show_name: null,
    spotify_episode_uri: null,
    audiobook_title: null,
    audiobook_uri: null,
    audiobook_chapter_uri: null,
    audiobook_chapter_title: null,
    reason_start: 'clickrow',
    reason_end: 'trackdone',
    shuffle: false,
    skipped: false,
    offline: false,
    offline_timestamp: null,
    incognito_mode: false,
};

export function spotifyRow(overrides: Partial<SpotifyStreamingHistoryRow>): SpotifyStreamingHistoryRow {
    return { ...EMPTY_ROW, ...overrides };
}

export const TRACK_ROW = spotifyRow({
    ts: '2024-03-10T18:04:30Z',
    ms_played: 210_500,
    master_metadata_track_name: 'Paper Lanterns',
    master_metadata_album_artist_name: 'The Example Band',
    master_metadata_album_album_name: 'Night Market',
    spotify_track_uri: 'spotify:track:0000000000000000000001',
    reason_start: 'trackdone',
    reason_end: 'trackdone',
    shuffle: true,
    offline: true,
    offline_timestamp: 1_710_093_660,
});

export const EPISODE_ROW = spotifyRow({
    ts: '2024-03-11T07:45:00Z',
    platform: 'Linux [x86-64 0]',
    ms_played: 1_800_000,
    episode_name: 'Episode 12: Testing Things',
    episode_show_name: 'The Fake Podcast',
    spotify_episode_uri: 'spotify:episode:0000000000000000000002',
    reason_end: 'endplay',
});

export const AUDIOBOOK_ROW = spotifyRow({
    ts: '2025-04-17T12:43:28Z',
    ms_played: 3563,
    audiobook_title: 'The Imaginary Case',
    audiobook_uri: 'spotify:show:0000000000000000000003',
    audiobook_chapter_uri: 'spotify:episode:0000000000000000000004',
    audiobook_chapter_title: 'Chapter 1',
    reason_start: 'unknown',
    reason_end: 'endplay',
    skipped: true,
    // Older exports use milliseconds here.
    offline_timestamp: 1_744_893_805_000,
});

export const VIDEO_TRACK_ROW = spotifyRow({
    ts: '2022-11-30T14:44:33Z',
    ms_played: 12_171,
    master_metadata_track_name: 'Musical Number (Live)',
    master_metadata_album_artist_name: 'Stage Cast',
    master_metadata_album_album_name: 'The Musical',
    spotify_track_uri: 'spotify:track:0000000000000000000005',
    skipped: true,
    offline: null,
});

export const NO_URI_ROW = spotifyRow({
    ts: '2025-01-02T11:42:36Z',
    ms_played: 4677,
    skipped: true,
});

/**
 * Which files of a personal data export feed which importer, and where each one lands in the local-file
 * trigger import folder so the importer's blueprint glob matches it.
 *
 * Paths in `from` are micromatch globs relative to the takeout root (`INGEST_TAKEOUT_DIR`, default
 * `~/Documents/takeout`). The takeout root is read-only: `corpus.ts sync` only ever copies out of it.
 * The copied corpus lives in `apps/backend/temp/ingest-corpus/` (gitignored, it is personal data).
 */

export type ImporterId =
    | 'google-timeline'
    | 'google-semantic-location-history'
    | 'youtube-watch-history'
    | 'ics-calendar'
    | 'spotify-streaming-history-script'
    | 'google-maps-places';

export interface ImporterDefinition {
    id: ImporterId;
    /** Blueprint file in `tools/ingest-harness/blueprints/`. */
    blueprintFile: string;
    /** Blueprint node id of the module that turns the raw file into activities. */
    transformNodeId: number;
    /** Blueprint node id of the store-activity module. */
    storeNodeId: number;
}

export interface CorpusSource {
    /** Stable id, used for `--only` filters and report rows. */
    id: string;
    importer: ImporterId;
    /** Glob(s) relative to the takeout root. */
    from: string | string[];
    /** Target path inside the import folder for a matched file (relative to the takeout root). */
    to: (relativePath: string) => string;
    /** Optional: decompress before use. */
    gunzip?: boolean;
    notes?: string;
}

export const importers: Record<ImporterId, ImporterDefinition> = {
    'google-timeline': {
        id: 'google-timeline',
        blueprintFile: 'google-timeline.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    'google-semantic-location-history': {
        id: 'google-semantic-location-history',
        blueprintFile: 'google-semantic-location-history.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    'youtube-watch-history': {
        id: 'youtube-watch-history',
        blueprintFile: 'youtube-watch-history.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    'ics-calendar': {
        id: 'ics-calendar',
        blueprintFile: 'ics-calendar.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    'spotify-streaming-history-script': {
        id: 'spotify-streaming-history-script',
        blueprintFile: 'spotify-streaming-history-script.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    'google-maps-places': {
        id: 'google-maps-places',
        blueprintFile: 'google-maps-places.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
};

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const takeout2025 = 'takeout-20250203T120614Z-001/Takeout';
const outlookTakeout = 'kage0x3b@outlook.com-Takeout';

export const corpusSources: CorpusSource[] = [
    {
        id: 'timeline-2026',
        importer: 'google-timeline',
        from: 'Timeline.json',
        to: () => 'google/timeline/timeline.json',
        notes: 'On-device Timeline export (semanticSegments), newest snapshot.',
    },
    {
        id: 'timeline-old',
        importer: 'google-timeline',
        from: 'Timeline_old.json',
        to: () => 'google/timeline/timeline_old.json',
        notes: 'Older snapshot of the same timeline; should be almost entirely deduplicated against timeline-2026.',
    },
    {
        id: 'semantic-location-history',
        importer: 'google-semantic-location-history',
        from: `${outlookTakeout}/Location History/Semantic Location History/*/*.json`,
        to: (path) => {
            const [year, file] = path.split('/').slice(-2);
            return `google/takeout/Location History/Semantic Location History/${year}/${file}`;
        },
        notes: 'Pre-2024 monthly semantic files (2017-2019 in this export); overlaps the Timeline export.',
    },
    {
        id: 'youtube-watch-history-2025',
        importer: 'youtube-watch-history',
        from: `${takeout2025}/YouTube und YouTube Music/Verlauf/Wiedergabeverlauf.html`,
        to: () => 'youtube/takeout-2025/watch-history.html',
        notes: 'German takeout names the file Wiedergabeverlauf.html; the blueprint glob expects watch-history.html.',
    },
    {
        id: 'ics-takeout-2025',
        importer: 'ics-calendar',
        from: `${takeout2025}/Kalender/*.ics`,
        to: (path) => `calendar/takeout-2025/${basename(path)}`,
    },
    {
        id: 'ics-calendar-2026',
        importer: 'ics-calendar',
        from: 'calendar/*.ics',
        to: (path) => `calendar/export-2026/${basename(path)}`,
    },
    {
        id: 'spotify-audio',
        importer: 'spotify-streaming-history-script',
        from: 'Spotify Extended Streaming History/Streaming_History_Audio_*.json',
        to: (path) => `spotify/${basename(path)}`,
        notes: 'Imported through the execute-code blueprint (inline script), there is no Spotify module yet.',
    },
    {
        id: 'maps-saved-places-2025',
        importer: 'google-maps-places',
        from: `${takeout2025}/Maps (Meine Orte)/Gespeicherte Orte.json`,
        to: () => 'google/maps/takeout-2025/saved-places.json',
        notes: 'German takeout; entries without a resolvable place come with [0, 0] coordinates.',
    },
    {
        id: 'maps-reviews-2025',
        importer: 'google-maps-places',
        from: `${takeout2025}/Maps (Meine Orte)/Bewertungen.json`,
        to: () => 'google/maps/takeout-2025/reviews.json',
    },
    {
        id: 'maps-reviews-outlook',
        importer: 'google-maps-places',
        from: `${outlookTakeout}/Maps (your places)/Reviews.json`,
        to: () => 'google/maps/takeout-outlook/reviews.json',
        notes: 'English takeout (Title Case keys); overlaps maps-reviews-2025 with different review dates.',
    },
];

/**
 * Known export areas without an importer. `corpus.ts inventory` reports these by size so the plan can
 * rank them; anything matched by neither a source nor this list shows up as "unclassified".
 */
export const knownUnsupported: { area: string; glob: string; notes: string }[] = [
    {
        area: 'Spotify video streams',
        glob: 'Spotify Extended Streaming History/Streaming_History_Video_*.json',
        notes: 'Same shape as audio, tiny.',
    },
    { area: 'Spotify account export (zip)', glob: 'my_spotify_data_*.zip', notes: 'Archive; not unpacked.' },
    {
        area: 'Airbnb',
        glob: 'Airbnb_data_request_*/**',
        notes: 'Reservations, messages, reviews, search history (JSON).',
    },
    { area: 'WhatsApp chats', glob: 'whatsapp-exports/**', notes: 'Plain-text chat export.' },
    {
        area: 'Google raw Location History (Records)',
        glob: `${outlookTakeout}/Location History/Location History.json`,
        notes: 'Raw GPS records, 82 MB.',
    },
    {
        area: 'Google Timeline Edits',
        glob: `${takeout2025}/Standortverlauf \\(Zeitachse\\)/**`,
        notes: 'Timeline Edits.json (place aggregates, 166 MB).',
    },
    { area: 'Older Timeline snapshot (gz)', glob: 'Timeline2.json.gz', notes: 'Older Timeline.json snapshot.' },
    { area: 'Google Fit', glob: `${takeout2025}/Google Fit/**`, notes: 'TCX + daily metrics JSON/CSV, 1.8 GB.' },
    {
        area: 'Google My Activity',
        glob: `${takeout2025}/Meine Aktivitäten/**`,
        notes: 'HTML per Google product (Search 52 MB, Play 25 MB, Maps 14 MB).',
    },
    {
        area: 'YouTube other',
        glob: `${takeout2025}/YouTube und YouTube Music/**`,
        notes: 'Search history, playlists, subscriptions (CSV/HTML).',
    },
    { area: 'Google Photos', glob: '**/Google Fotos/**', notes: 'Photos come from Immich instead.' },
    {
        area: 'Google Photos (outlook)',
        glob: `${outlookTakeout}/Google Photos/**`,
        notes: 'Photos come from Immich instead.',
    },
    { area: 'Chrome', glob: '**/Chrome/**', notes: 'Bookmarks/history JSON.' },
    { area: 'Contacts', glob: '**/{Google Kontakte,Contacts}/**', notes: 'VCF.' },
    {
        area: 'Maps other (labeled places, commute, Gespeichert CSV lists)',
        glob: '**/{Maps,Maps \\(Meine Orte\\),Maps \\(your places\\),Gespeichert,Saved}/**',
        notes: 'Saved/reviews JSON is imported; labeled places have no dates and the CSV lists are skipped by decision.',
    },
    {
        area: 'Google Pay / Play',
        glob: '**/{Google Pay,Google Play Store,Google Play Bücher,Google Play Filme & Serien}/**',
        notes: 'Purchases.',
    },
    {
        area: 'Outlook takeout (other)',
        glob: `${outlookTakeout}/**`,
        notes: 'Older account export; overlaps the 2025 Google takeout.',
    },
    { area: 'Google takeout 2025 (other)', glob: `${takeout2025}/**`, notes: 'Small product exports.' },
    { area: 'Archives', glob: '*.{tgz,zip}', notes: 'Original archives of the unpacked folders.' },
];

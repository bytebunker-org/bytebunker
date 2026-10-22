/**
 * Which files of a personal data export feed which importer, and where each one lands in the local-file
 * trigger import folder so the importer's blueprint glob matches it.
 *
 * Paths in `from` are micromatch globs relative to the source's root: the takeout root (`INGEST_TAKEOUT_DIR`, default
 * `~/Documents/takeout`) or, for `root: 'home'`, the home directory (`INGEST_HOME_DIR`), e.g. live browser profiles.
 * Both roots are read-only: `corpus.ts sync` only ever copies out of them.
 * The copied corpus lives in `apps/backend/temp/ingest-corpus/` (gitignored, it is personal data).
 */

export type ImporterId =
    | 'google-timeline'
    | 'google-semantic-location-history'
    | 'youtube-watch-history'
    | 'ics-calendar'
    | 'spotify-streaming-history-script'
    | 'browser-history-database'
    | 'chrome-takeout-history'
    | 'browser-bookmarks-html';

export interface ImporterDefinition {
    id: ImporterId;
    /** Blueprint file in `tools/ingest-harness/blueprints/`. */
    blueprintFile: string;
    /** Blueprint node id of the module that turns the raw file into activities. */
    transformNodeId: number;
    /** Blueprint node id of the store-activity module. */
    storeNodeId: number;
}

export type CorpusRoot = 'takeout' | 'home';

export interface CorpusSource {
    /** Stable id, used for `--only` filters and report rows. */
    id: string;
    importer: ImporterId;
    /** Where `from` is resolved. Defaults to the takeout root. */
    root?: CorpusRoot;
    /** Glob(s) relative to the root. For the home root, keep the part before the first glob specific: it is walked. */
    from: string | string[];
    /** Target path inside the import folder for a matched file (relative to the root). */
    to: (relativePath: string) => string;
    /** Optional: decompress before use. */
    gunzip?: boolean;
    /**
     * Optional: the file is a SQLite database possibly in WAL mode (a live browser profile). Its `-wal` is copied too
     * and checkpointed into the corpus copy, so the corpus holds one self-contained file, the way a user would export
     * it with the browser closed.
     */
    sqlite?: boolean;
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
    'browser-history-database': {
        id: 'browser-history-database',
        blueprintFile: 'browser-history-database.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    'chrome-takeout-history': {
        id: 'chrome-takeout-history',
        blueprintFile: 'chrome-takeout-history.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    'browser-bookmarks-html': {
        id: 'browser-bookmarks-html',
        blueprintFile: 'browser-bookmarks-html.blueprint.json',
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
        id: 'firefox-default-release',
        importer: 'browser-history-database',
        root: 'home',
        from: '.mozilla/firefox/*.default-release/places.sqlite',
        to: () => 'browser/firefox/default-release/places.sqlite',
        sqlite: true,
        notes: 'Live Firefox profile, 2020-05 onwards; overlaps dev-edition through Firefox Sync.',
    },
    {
        id: 'firefox-dev-edition',
        importer: 'browser-history-database',
        root: 'home',
        from: '.mozilla/firefox/*.dev-edition-default/places.sqlite',
        to: () => 'browser/firefox/dev-edition-default/places.sqlite',
        sqlite: true,
        notes: 'Live Firefox Developer Edition profile (in use), 2019-07 onwards.',
    },
    {
        id: 'firefox-default',
        importer: 'browser-history-database',
        root: 'home',
        from: '.mozilla/firefox/*.default/places.sqlite',
        to: () => 'browser/firefox/default/places.sqlite',
        sqlite: true,
        notes: 'Almost unused profile.',
    },
    {
        id: 'chrome-local',
        importer: 'browser-history-database',
        root: 'home',
        from: ['.config/google-chrome/Default/History', '.config/google-chrome/Profile 1/History'],
        to: (path) => `browser/chrome/${path.split('/').slice(-2, -1)[0]}/History`,
        sqlite: true,
    },
    {
        id: 'chromium-local',
        importer: 'browser-history-database',
        root: 'home',
        from: '.config/chromium/Default/History',
        to: () => 'browser/chromium/Default/History',
        sqlite: true,
    },
    {
        id: 'chrome-takeout-history',
        importer: 'chrome-takeout-history',
        from: [`${takeout2025}/Chrome/Verlauf.json`, `${outlookTakeout}/Chrome/BrowserHistory.json`],
        to: (path) =>
            path.startsWith(outlookTakeout)
                ? 'browser/chrome-takeout-2020/BrowserHistory.json'
                : 'browser/chrome-takeout-2025/Verlauf.json',
        notes: 'German (2025, qualifier only) and English (2019/2020, with page_transition) exports.',
    },
    {
        id: 'chrome-takeout-bookmarks',
        importer: 'browser-bookmarks-html',
        from: [`${takeout2025}/Chrome/{Lesezeichen,Leseliste}.html`, `${outlookTakeout}/Chrome/Bookmarks.html`],
        to: (path) =>
            path.startsWith(outlookTakeout)
                ? 'browser/chrome-takeout-2020/Chrome/Bookmarks.html'
                : `browser/chrome-takeout-2025/Chrome/${basename(path)}`,
        notes: 'Netscape bookmark HTML; ADD_DATE in Unix seconds (2025) or WebKit microseconds (2019).',
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
    {
        area: 'Chrome',
        glob: '**/Chrome/**',
        notes: 'Settings, extensions, autofill, search engines (history and bookmarks are imported).',
    },
    { area: 'Contacts', glob: '**/{Google Kontakte,Contacts}/**', notes: 'VCF.' },
    {
        area: 'Maps saved/your places',
        glob: '**/{Maps,Maps \\(Meine Orte\\),Maps \\(your places\\),Gespeichert,Saved}/**',
        notes: 'Saved places, reviews.',
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

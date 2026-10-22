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
    | 'google-maps-places'
    | 'airbnb-export'
    | 'whatsapp'
    | 'spotify-streaming-history'
    | 'browser-history-database'
    | 'chrome-takeout-history'
    | 'browser-bookmarks-html'
    | 'google-my-activity'
    | 'youtube-search-history';

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
    'google-maps-places': {
        id: 'google-maps-places',
        blueprintFile: 'google-maps-places.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    'airbnb-export': {
        id: 'airbnb-export',
        blueprintFile: 'airbnb-export.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    whatsapp: {
        id: 'whatsapp',
        blueprintFile: 'whatsapp.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    'spotify-streaming-history': {
        id: 'spotify-streaming-history',
        blueprintFile: 'spotify-streaming-history.blueprint.json',
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
    'google-my-activity': {
        id: 'google-my-activity',
        blueprintFile: 'google-my-activity.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
    'youtube-search-history': {
        id: 'youtube-search-history',
        blueprintFile: 'youtube-search-history.blueprint.json',
        transformNodeId: 2,
        storeNodeId: 3,
    },
};

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const takeout2025 = 'takeout-20250203T120614Z-001/Takeout';
const outlookTakeout = 'kage0x3b@outlook.com-Takeout';

/** Keeps the request folder and puts the file under `airbnb/<request>/json/`, where the blueprint glob finds it. */
const airbnbTarget = (file: string) => (path: string) => `airbnb/${path.split('/').slice(-3)[0]}/json/${file}.json`;

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
        id: 'airbnb-reservations',
        importer: 'airbnb-export',
        from: 'Airbnb_data_request_*/json/reservations.json',
        to: airbnbTarget('reservations'),
    },
    {
        id: 'airbnb-search-history',
        importer: 'airbnb-export',
        from: 'Airbnb_data_request_*/json/search_history.json',
        to: airbnbTarget('search_history'),
    },
    {
        id: 'airbnb-messages',
        importer: 'airbnb-export',
        from: 'Airbnb_data_request_*/json/messages.json',
        to: airbnbTarget('messages'),
    },
    {
        id: 'airbnb-reviews',
        importer: 'airbnb-export',
        from: 'Airbnb_data_request_*/json/reviews.json',
        to: airbnbTarget('reviews'),
    },
    {
        id: 'airbnb-wishlists-unsupported',
        importer: 'airbnb-export',
        from: 'Airbnb_data_request_*/json/wishlists.json',
        to: airbnbTarget('wishlists'),
        notes: 'Not importable on purpose: the module must return no activities for other files of the folder.',
    },
    {
        id: 'whatsapp-hannah-km',
        importer: 'whatsapp',
        from: 'whatsapp-exports/hannah-km/WhatsApp Chat with *.txt',
        to: (path) => `whatsapp/${basename(path)}`,
        notes: 'Folder copy of the zip (same chat file); derived files next to it are not exports and are not matched.',
    },
    {
        id: 'spotify-audio',
        importer: 'spotify-streaming-history',
        from: 'Spotify Extended Streaming History/Streaming_History_Audio_*.json',
        to: (path) => `spotify/${basename(path)}`,
        notes: 'Unpacked my_spotify_data_2026_06_13.zip (identical files). The old execute-code script blueprint stays in blueprints/ but is no longer used.',
    },
    {
        id: 'spotify-video',
        importer: 'spotify-streaming-history',
        from: 'Spotify Extended Streaming History/Streaming_History_Video_*.json',
        to: (path) => `spotify/${basename(path)}`,
        notes: 'Music videos and video podcasts; same row shape as audio.',
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
    {
        id: 'my-activity-2025',
        importer: 'google-my-activity',
        from: `${takeout2025}/Meine Aktivitäten/*/*.html`,
        to: (path) => `google/my-activity/takeout-2025/${path.split('/').slice(-2).join('/')}`,
        notes: 'German My Activity, one file per product (Search 50k entries, Play Store 26k, Maps 14.5k, ...).',
    },
    {
        id: 'my-activity-outlook',
        importer: 'google-my-activity',
        from: `${outlookTakeout}/My Activity/*/*.html`,
        to: (path) => `google/my-activity/outlook/${path.split('/').slice(-2).join('/')}`,
        notes: 'English My Activity of the older account (2016-2020); no overlap with the 2025 export.',
    },
    {
        id: 'youtube-search-history-2025',
        importer: 'youtube-search-history',
        from: `${takeout2025}/YouTube und YouTube Music/Verlauf/Suchverlauf.html`,
        to: () => 'youtube/takeout-2025/search-history.html',
        notes: 'Same entries as My Activity/YouTube searches; identical stable keys.',
    },
    {
        id: 'youtube-search-history-outlook',
        importer: 'youtube-search-history',
        from: `${outlookTakeout}/YouTube and YouTube Music/history/search-history.html`,
        to: () => 'youtube/outlook/search-history.html',
    },
    {
        id: 'youtube-watch-history-outlook',
        importer: 'youtube-watch-history',
        from: `${outlookTakeout}/YouTube and YouTube Music/history/watch-history.html`,
        to: () => 'youtube/outlook/watch-history.html',
        notes: 'English rendering ("Watched …", "Jul 7, 2018, 2:45:40 AM CEST").',
    },
];

/**
 * Known export areas without an importer. `corpus.ts inventory` reports these by size so the plan can
 * rank them; anything matched by neither a source nor this list shows up as "unclassified".
 */
export const knownUnsupported: { area: string; glob: string; notes: string }[] = [
    {
        area: 'Spotify account export (zip)',
        glob: 'my_spotify_data_*.zip',
        notes: 'Archive of the unpacked Spotify Extended Streaming History folder (identical as of 2026-06-13).',
    },
    {
        area: 'Airbnb (other files)',
        glob: 'Airbnb_data_request_*/json/{account_security,activity_log,experiences,guest_referrals,id_verification,payment_*,profile_information,search_telemetry_signals,third_party_*,wishlists}.json',
        notes: 'Payments, ID verification, telemetry, wishlists (no timestamps), experiences (no dates): not imported.',
    },
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
        area: 'Google Assistant recordings',
        glob: `${takeout2025}/Meine Aktivitäten/Google Assistant/*.mp3`,
        notes: 'Voice recordings referenced by My Activity entries (attachmentFiles); audio itself not imported.',
    },
    {
        area: 'YouTube other',
        glob: `${takeout2025}/YouTube und YouTube Music/**`,
        notes: 'Playlists, subscriptions, comments (CSV/HTML).',
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

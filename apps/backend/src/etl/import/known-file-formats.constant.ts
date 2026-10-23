import type { FileSample } from './type/file-detection.interface.js';

/**
 * Formats we recognise but have no importer for yet. Only used to explain an unmatched file ("looks like Google
 * Fit, no importer yet") instead of a bare "no pipeline". Importers recognise their own files via `detectFile`;
 * remove an entry once its importer ships, or it claims "no importer" for files that importer fails to detect.
 */
export const KNOWN_FILE_FORMATS: { format: string; test: (sample: FileSample) => boolean }[] = [
    {
        // The short "Account data" history; only the Extended Streaming History has an importer.
        format: 'Spotify streaming history (account data, StreamingHistory_*.json)',
        test: (s) => s.extension === 'json' && /"endTime"\s*:/.test(s.head) && /"msPlayed"\s*:/.test(s.head),
    },
    {
        format: 'Google Location History records (raw GPS)',
        test: (s) => s.extension === 'json' && /^\s*\{\s*"locations"\s*:/.test(s.head) && /latitudeE7/.test(s.head),
    },
    { format: 'Google Timeline edits', test: (s) => s.extension === 'json' && /"timelineEdits"\s*:/.test(s.head) },
    { format: 'Google Fit (TCX workout)', test: (s) => s.extension === 'tcx' },
    {
        format: 'Google Fit (daily metrics)',
        test: (s) => /google fit|fit\//i.test(s.relativePath) && (s.extension === 'csv' || s.extension === 'json'),
    },
    { format: 'vCard contacts', test: (s) => /^\uFEFF?\s*BEGIN:VCARD/i.test(s.head) },
    { format: 'Google Takeout archive index', test: (s) => /archive_browser|Archiv_Übersicht/i.test(s.fileName) },
];

export function guessKnownFormat(sample: FileSample): string | undefined {
    return KNOWN_FILE_FORMATS.find((known) => known.test(sample))?.format;
}

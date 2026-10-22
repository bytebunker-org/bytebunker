import type { FileSample } from './type/file-detection.interface.js';

/**
 * Formats we recognise but have no importer for yet. Only used to explain an unmatched file ("looks like Google
 * Fit, no importer yet") instead of a bare "no pipeline". Importers recognise their own files via `detectFile`.
 */
export const KNOWN_FILE_FORMATS: { format: string; test: (sample: FileSample) => boolean }[] = [
    {
        format: 'Spotify Extended Streaming History',
        test: (s) => s.extension === 'json' && /"ms_played"\s*:/.test(s.head) && /"ts"\s*:/.test(s.head),
    },
    {
        format: 'Google Location History records (raw GPS)',
        test: (s) => s.extension === 'json' && /^\s*\{\s*"locations"\s*:/.test(s.head) && /latitudeE7/.test(s.head),
    },
    { format: 'Google Timeline edits', test: (s) => s.extension === 'json' && /"timelineEdits"\s*:/.test(s.head) },
    {
        format: 'Google My Activity',
        test: (s) => s.extension === 'html' && /<title>\s*(My Activity|Meine Aktivitäten)/i.test(s.head),
    },
    { format: 'Google Fit (TCX workout)', test: (s) => s.extension === 'tcx' },
    {
        format: 'Google Fit (daily metrics)',
        test: (s) => /google fit|fit\//i.test(s.relativePath) && (s.extension === 'csv' || s.extension === 'json'),
    },
    { format: 'Chrome browser history', test: (s) => s.extension === 'json' && /"Browser History"\s*:/.test(s.head) },
    { format: 'vCard contacts', test: (s) => /^﻿?\s*BEGIN:VCARD/i.test(s.head) },
    {
        format: 'WhatsApp chat export',
        test: (s) => s.extension === 'txt' && /^﻿?\[?\d{1,2}[./]\d{1,2}[./]\d{2,4},? \d{1,2}:\d{2}/m.test(s.head),
    },
    { format: 'Airbnb data export', test: (s) => /airbnb/i.test(s.relativePath) && s.extension === 'json' },
    { format: 'Google Takeout archive index', test: (s) => /archive_browser|Archiv_Übersicht/i.test(s.fileName) },
];

export function guessKnownFormat(sample: FileSample): string | undefined {
    return KNOWN_FILE_FORMATS.find((known) => known.test(sample))?.format;
}

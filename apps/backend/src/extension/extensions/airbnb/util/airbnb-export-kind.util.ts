import { AirbnbExportFileKindEnum } from '@bytebunker/event-schema/extension/airbnb';

/** Top-level key of a json/*.json document → the kind of data it holds. */
const KIND_BY_KEY: Record<string, AirbnbExportFileKindEnum> = {
    reservations: AirbnbExportFileKindEnum.RESERVATIONS,
    bookingSessions: AirbnbExportFileKindEnum.RESERVATIONS,
    servicedata: AirbnbExportFileKindEnum.SEARCH_HISTORY,
    messageThreads: AirbnbExportFileKindEnum.MESSAGES,
    reviewsReceived: AirbnbExportFileKindEnum.REVIEWS,
    reviewsWritten: AirbnbExportFileKindEnum.REVIEWS,
};

export const AIRBNB_KIND_LABEL: Record<AirbnbExportFileKindEnum, string> = {
    [AirbnbExportFileKindEnum.RESERVATIONS]: 'reservations',
    [AirbnbExportFileKindEnum.SEARCH_HISTORY]: 'search history',
    [AirbnbExportFileKindEnum.MESSAGES]: 'messages',
    [AirbnbExportFileKindEnum.REVIEWS]: 'reviews',
    [AirbnbExportFileKindEnum.UNSUPPORTED]: 'unsupported',
};

/** Kind of a parsed document (the single object inside the file's array). */
export function detectAirbnbDocumentKind(document: unknown): AirbnbExportFileKindEnum {
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
        return AirbnbExportFileKindEnum.UNSUPPORTED;
    }

    for (const key of Object.keys(document)) {
        const kind = KIND_BY_KEY[key];
        if (kind) return kind;
    }

    return AirbnbExportFileKindEnum.UNSUPPORTED;
}

/**
 * Kind from the start of the raw file, without parsing it: every export file is `[ { "<first key>": ...` (a BOM counts as whitespace). The first
 * key decides, the files are large and the head is cut off anywhere.
 */
export function detectAirbnbHeadKind(head: string): AirbnbExportFileKindEnum {
    const firstKey = /^\s*\[\s*{\s*"([^"]+)"\s*:/.exec(head)?.[1];

    return (firstKey && KIND_BY_KEY[firstKey]) || AirbnbExportFileKindEnum.UNSUPPORTED;
}

/** Account that appears in every message thread: the exporting user. Undefined when it is not unique. */
export function detectOwnerAccountId(threads: { participantIds: string[] }[]): string | undefined {
    const withParticipants = threads.filter((thread) => thread.participantIds.length > 0);
    if (!withParticipants.length) return undefined;

    const common = withParticipants
        .map((thread) => new Set(thread.participantIds))
        .reduce((left, right) => new Set([...left].filter((id) => right.has(id))));

    return common.size === 1 ? [...common][0] : undefined;
}

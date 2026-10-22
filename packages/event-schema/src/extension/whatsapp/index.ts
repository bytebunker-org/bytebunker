export type WhatsAppMessageKind = 'text' | 'media' | 'deleted' | 'system' | 'location' | 'contact' | 'poll' | 'call';

/** One entry of a WhatsApp "Export chat" text file, after header detection and marker classification. */
export interface WhatsAppMessageModel {
    /** Device-local wall time as written in the export, `YYYY-MM-DDTHH:mm:ss` without zone. */
    wallTime: string;
    /** Undefined for system lines (encryption notice, security code changes, "X is a contact", missed calls). */
    sender?: string;
    /** Message text without the edited suffix and without the media placeholder; empty for bare media/deleted. */
    text: string;
    kind: WhatsAppMessageKind;
    edited: boolean;
    /** File name of an attached file, when the export names it (`IMG-...jpg (file attached)`, `<attached: ...>`). */
    mediaFileName?: string;
    latitude?: number;
    longitude?: number;
    /** 1-based line number of the header line in the file. */
    lineNumber: number;
}

export interface WhatsAppChatFormat {
    /** `android`: `D/M/YY, H:MM - `, `ios`: `[D/M/YY, H:MM:SS] `. */
    style: 'android' | 'ios';
    dateSeparator: '/' | '.' | '-';
    dateOrder: 'DMY' | 'MDY';
    /** True when the times carry an AM/PM marker. */
    hour12: boolean;
    /** True when the order had to be guessed because no date had a day or month above 12. */
    dateOrderGuessed: boolean;
}

export interface WhatsAppChatModel {
    format: WhatsAppChatFormat;
    messages: WhatsAppMessageModel[];
    /** Non-empty lines before the first header or headers with impossible dates that were skipped. */
    skippedLines: number;
}

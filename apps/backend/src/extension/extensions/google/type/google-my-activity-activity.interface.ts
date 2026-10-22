import type {
    GoogleMyActivityActionEnum,
    GoogleMyActivityLink,
    GoogleMyActivityLocation,
} from '@bytebunker/event-schema/extension/google-my-activity';

/**
 * secondary type: GoogleMyActivity. Properties every activity imported from Takeout "My Activity" HTML carries;
 * arrays are stored as JSON strings.
 */
export interface GoogleMyActivityActivityInterface {
    /** "Google Suche", "Maps", "Search", ... as printed in the export (German or English). */
    googleProduct: string;

    /** Card header when it differs from the product (app name, web site). */
    googleHeader?: string;

    googleProducts?: string[];

    action: GoogleMyActivityActionEnum;

    /** First body line as displayed, e.g. "Gesucht nach: wetter trier". */
    actionText: string;

    title?: string;

    lines?: string[];

    secondaryLinks?: GoogleMyActivityLink[];

    locations?: GoogleMyActivityLocation[];

    details?: string[];

    attachmentFiles?: string[];
}

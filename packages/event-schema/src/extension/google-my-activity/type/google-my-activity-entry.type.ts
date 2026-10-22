/**
 * What an entry of a Google Takeout "My Activity" HTML file says the user did, normalised over the German and
 * English verb phrases ("Gesucht nach: …", "Searched for …", "… aufgerufen", "Visited …", ...).
 */
export enum GoogleMyActivityActionEnum {
    SEARCHED = 'searched',
    /** Voice query to Google Assistant ("… gesagt"); the link is the resulting web search. */
    SAID = 'said',
    /** Dictionary lookup on Google Search ("Definiert …", "Defined …"). */
    DEFINED = 'defined',
    /** Maps route request ("Route nach …", "Directions to …"). */
    DIRECTIONS = 'directions',
    /** Prompt sent to Gemini ("Eingegebener Prompt: …"); the response follows the timestamp. */
    PROMPTED = 'prompted',
    VISITED = 'visited',
    VIEWED = 'viewed',
    WATCHED = 'watched',
    READ = 'read',
    LISTENED = 'listened',
    SKIPPED = 'skipped',
    USED = 'used',
    OPENED = 'opened',
    INSTALLED = 'installed',
    UNINSTALLED = 'uninstalled',
    TRANSLATED = 'translated',
    CALLED = 'called',
    SHARED = 'shared',
    ANSWERED = 'answered',
    LIKED = 'liked',
    DISLIKED = 'disliked',
    SUBSCRIBED = 'subscribed',
    JOINED_BETA = 'joined-beta',
    PURCHASE_STARTED = 'purchase-started',
    PAID = 'paid',
    NOTIFICATION = 'notification',
    FEEDBACK = 'feedback',
    OTHER = 'other',
}

export interface GoogleMyActivityLink {
    text: string;

    url: string;
}

export interface GoogleMyActivityLocation {
    /** Link text, e.g. "Ungefähre Gegend" / "this area" / "An diesem Ort" / "this place". */
    name?: string;

    /** The whole caption line, e.g. "Ungefähre Gegend - Aus Meine Orte (Zuhause)". */
    description: string;

    latitude?: number;

    longitude?: number;

    /** `area`: map centre of an approximate area (`center=`), `place`: a point (`query=`). */
    precision?: 'area' | 'place';

    mapsUrl?: string;
}

export interface GoogleMyActivityEntry {
    /** Card header: usually the product, sometimes an app name or a web site. */
    header: string;

    /** Product the entry belongs to: first entry of the "Produkte:/Products:" caption, else the header. */
    product: string;

    /** All products of the caption. */
    products: string[];

    action: GoogleMyActivityActionEnum;

    /** First body line as displayed, link texts inline, e.g. "Gesucht nach: wetter trier". */
    actionText: string;

    /** First body line with the primary link replaced by `{link}`, e.g. "Gesucht nach: {link}". */
    actionTemplate: string;

    /** Primary link text, else the free-text subject of the verb phrase (search query without link, app id, ...). */
    title?: string;

    /** Primary link target. */
    url?: string;

    /** All other links of the body (channel, artist, route stops, ...). */
    secondaryLinks: GoogleMyActivityLink[];

    /** Body lines between the action line and the timestamp (route stops, notification topics, artist, ...). */
    lines: string[];

    /** ISO 8601 with the offset printed in the export, e.g. `2025-02-03T12:08:18.000+01:00`. */
    timestamp: string;

    /** Text after the timestamp (Gemini response). */
    trailingText?: string;

    locations: GoogleMyActivityLocation[];

    /** "Details:" caption lines and any other caption section except "why is this here". */
    details: string[];

    /** Local files referenced by the entry (Assistant audio recordings, Gemini image uploads). */
    attachmentFiles: string[];
}

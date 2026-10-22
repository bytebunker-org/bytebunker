import { GoogleMyActivityActionEnum as Action } from '@bytebunker/event-schema/extension/google-my-activity';

/**
 * Verb phrases of Takeout "My Activity" entries (German 2025 export and English 2016-2020 exports). Matched in
 * order against the first body line with the primary link replaced by `{link}`, no-break spaces as plain spaces.
 * The `s` group is the subject: `{link}` (the title then comes from the link) or free text such as a search query
 * that Google did not link.
 */
export const GOOGLE_ACTIVITY_VERB_RULES: { pattern: RegExp; action: Action }[] = [
    // Searches
    { pattern: /^(?:Gesucht nach|Searched for):? ?(?<s>.*)$/s, action: Action.SEARCHED },
    { pattern: /^Gesucht wurde nach Funktionen von (?<s>.*)$/s, action: Action.SEARCHED },
    {
        pattern: /^(?:Mit (?:Google )?Lens(?: in Google Fotos)? gesucht|Searched (?:with|in) (?:Google )?Lens.*)$/,
        action: Action.SEARCHED,
    },
    { pattern: /^(?:Bild in „(?<s>.*)“ gesucht|Searched for an image in "(?<s2>.*)")$/, action: Action.SEARCHED },
    { pattern: /^(?:Definiert|Defined) (?<s>.*)$/s, action: Action.DEFINED },
    { pattern: /^(?:Route nach|Directions to) (?<s>.*)$/s, action: Action.DIRECTIONS },
    { pattern: /^(?:Said|Gesagt:?) (?<s>.*)$/s, action: Action.SAID },
    { pattern: /^(?<s>.*) gesagt$/s, action: Action.SAID },
    { pattern: /^(?:Eingegebener Prompt|Prompted|Prompt entered):? ?(?<s>.*)$/s, action: Action.PROMPTED },

    // Notifications before the generic "aufgerufen/angesehen/geöffnet" rules.
    { pattern: /benachrichtigung|notification/i, action: Action.NOTIFICATION },

    // Media
    { pattern: /^Watched (?<s>.*)$/s, action: Action.WATCHED },
    { pattern: /^(?:Listened to|Angehört) (?<s>.*)$/s, action: Action.LISTENED },
    { pattern: /^Skipped (?<s>.*)$/s, action: Action.SKIPPED },
    { pattern: /^Mit "Mag ich nicht" bewertet: ?(?<s>.*)$/s, action: Action.DISLIKED },
    { pattern: /^Mit "Mag ich" bewertet: ?(?<s>.*)$/s, action: Action.LIKED },
    { pattern: /^Disliked (?<s>.*)$/s, action: Action.DISLIKED },
    { pattern: /^Liked (?<s>.*)$/s, action: Action.LIKED },
    { pattern: /^Subscribed to (?<s>.*)$/s, action: Action.SUBSCRIBED },
    { pattern: /^(?<s>.*) abonniert$/s, action: Action.SUBSCRIBED },
    { pattern: /^(?:Gelesen:?|Read) (?<s>.*)$/s, action: Action.READ },
    { pattern: /^Gelesen:?$/, action: Action.READ },
    { pattern: /^Nachricht gelesen$/, action: Action.READ },

    // Apps
    { pattern: /^Uninstalled (?<s>.*)$/s, action: Action.UNINSTALLED },
    { pattern: /^Installed (?<s>.*)$/s, action: Action.INSTALLED },
    {
        pattern: /^(?:Mitglied beim Betaprogramm für|Joined beta program for|Vorregistriert für) (?<s>.*)$/s,
        action: Action.JOINED_BETA,
    },
    { pattern: /^(?:Kauf begonnen|Started purchase(?: of)?) (?<s>.*)$/s, action: Action.PURCHASE_STARTED },
    { pattern: /^(?<s>.*) mit Google Play Instant geöffnet$/s, action: Action.OPENED },
    { pattern: /^(?:My Maps-Karte geöffnet|Opened My Maps map):? ?(?<s>.*)$/s, action: Action.OPENED },
    { pattern: /^(?:Karte verwendet auf|Used a map on) (?<s>.*)$/s, action: Action.USED },
    { pattern: /^(?:Verwendet|Used):? ?(?<s>.*)$/s, action: Action.USED },
    { pattern: /^Verwendet:?$/, action: Action.USED },
    { pattern: /^(?<s>.*) (?:verwendet|genutzt|ausgewählt)$/s, action: Action.USED },

    // Payments: the amount is dropped from the details, see the parser.
    { pattern: /kontaktlos zu bezahlen|contactless/i, action: Action.PAID },

    // Maps contributions
    { pattern: /^(?:Angerufen|Called):? ?(?<s>.*)$/s, action: Action.CALLED },
    { pattern: /^(?:Geteilt|Shared):? ?(?<s>.*)$/s, action: Action.SHARED },
    { pattern: /^(?:Frage beantwortet zu|Answered questions about):? ?(?<s>.*)$/s, action: Action.ANSWERED },

    // Preferences
    {
        pattern:
            /^(?:Sie haben um weniger Inhalte wie|Hat angegeben, (?:weniger|mehr) Anzeigen von|Kein Interesse an|Not interested in|You asked for less content like)/,
        action: Action.FEEDBACK,
    },

    // Visits and views
    { pattern: /^(?<s>.*) übersetzt$/s, action: Action.TRANSLATED },
    { pattern: /^Translated (?<s>.*)$/s, action: Action.TRANSLATED },
    { pattern: /^(?:Visited|Aufgerufen:?|Aufgerufene) (?<s>.*)$/s, action: Action.VISITED },
    { pattern: /^(?<s>.*) aufgerufen$/s, action: Action.VISITED },
    { pattern: /^(?:Bild angesehen von|Viewed image from) ?(?<s>.*)$/s, action: Action.VIEWED },
    {
        pattern: /^(?:Artikel gesehen in|Saw articles in|Videos gesehen in:?|Saw videos in) (?<s>.*)$/s,
        action: Action.VIEWED,
    },
    { pattern: /^(?:Angesehen:?|Viewed|Interacted with) (?<s>.*)$/s, action: Action.VIEWED },
    { pattern: /^(?<s>.*) angesehen$/s, action: Action.VIEWED },
    { pattern: /^(?:Auf Google Maps erkundet|Explored on Google Maps)$/, action: Action.VIEWED },
    { pattern: /^{link}$/, action: Action.VIEWED },
];

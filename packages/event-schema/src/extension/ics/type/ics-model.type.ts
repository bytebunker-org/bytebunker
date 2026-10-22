/**
 * Normalized model of an iCalendar (RFC 5545) document, as stored with imported calendar data.
 *
 * Every property either lands in a typed field or is kept verbatim in `extraProperties` (jCal form, RFC 7265),
 * so nothing from the source file is lost: vendor extensions (X-MICROSOFT-*, X-GOOGLE-*, X-APPLE-*, ...),
 * newer RFC properties and unknown subcomponents all survive. Well-known vendor extensions are additionally
 * decoded into `IcsVendorExtensions`.
 */

export type IcsComponentType = 'VEVENT' | 'VTODO' | 'VJOURNAL' | 'VFREEBUSY' | 'VAVAILABILITY';

/** How a date value was written: UTC (`...Z`), with a TZID, without zone (floating) or as DATE (all-day). */
export type IcsDateKind = 'utc' | 'zoned' | 'floating' | 'date';

export interface IcsDateValue {
    /** Value as written in basic format, e.g. `20260901T140000`, `20260901T140000Z` or `20260901`. */
    value: string;

    /** TZID parameter as written. */
    tzid?: string;

    /** IANA zone the TZID resolved to (directly, via the Windows zone table or a VTIMEZONE in the file). */
    resolvedZone?: string;

    kind: IcsDateKind;

    /** Resolved instant as ISO 8601 with offset. Floating and DATE values are read in the import's floating zone. */
    iso: string;
}

export type IcsJCalParameterValue = string | string[];

export type IcsJCalParameters = Record<string, IcsJCalParameterValue>;

/** jCal property: `[name, parameters, valueType, ...values]`, name lowercase. */
export type IcsJCalProperty = [string, IcsJCalParameters, string, ...unknown[]];

/** jCal component: `[name, properties, subcomponents]`, name lowercase. */
export type IcsJCalComponent = [string, IcsJCalProperty[], IcsJCalComponent[]];

export interface IcsCalendarModel {
    prodId?: string;
    version?: string;
    calScale?: string;
    method?: string;

    /** RFC 7986 NAME or X-WR-CALNAME. */
    name?: string;

    /** RFC 7986 DESCRIPTION or X-WR-CALDESC. */
    description?: string;

    /** X-WR-TIMEZONE, the default zone some producers (Google) use for floating values. */
    defaultTimezone?: string;

    /** RFC 7986 COLOR or X-APPLE-CALENDAR-COLOR. */
    color?: string;

    /** RFC 7986 UID / X-WR-RELCALID. */
    uid?: string;

    /** RFC 7986 URL / SOURCE. */
    url?: string;
    source?: string;

    /** RFC 7986 REFRESH-INTERVAL or X-PUBLISHED-TTL, duration text. */
    refreshInterval?: string;

    lastModified?: string;

    /** All calendar-level properties not consumed above. */
    extraProperties: IcsJCalProperty[];
}

export interface IcsTimezoneModel {
    tzid: string;
    /** IANA zone matching the TZID, if one could be determined. */
    resolvedZone?: string;
    /** The VTIMEZONE component in jCal form. */
    jcal: IcsJCalComponent;
}

export interface IcsParticipantModel {
    role: 'organizer' | 'attendee';
    /** CAL-ADDRESS as written, usually `mailto:...`. */
    calAddress: string;
    /** Address without `mailto:`, lowercased if it is an email address. */
    email?: string;
    name?: string;
    /** RFC 5545 PARTSTAT, e.g. ACCEPTED, DECLINED, TENTATIVE, NEEDS-ACTION. */
    participationStatus?: string;
    /** RFC 5545 ROLE, e.g. REQ-PARTICIPANT, OPT-PARTICIPANT, CHAIR. */
    participationRole?: string;
    rsvp?: boolean;
    /** RFC 5545 CUTYPE, e.g. INDIVIDUAL, GROUP, RESOURCE, ROOM. */
    calendarUserType?: string;
    sentBy?: string;
    delegatedTo?: string[];
    delegatedFrom?: string[];
    member?: string[];
    directory?: string;
    language?: string;
    /** Parameters not consumed above (incl. X- parameters such as X-NUM-GUESTS). */
    extraParameters: IcsJCalParameters;
}

export interface IcsAlarmModel {
    action?: string;
    /** Relative trigger as duration text, e.g. `-PT15M`. */
    triggerRelative?: string;
    triggerRelatedTo?: 'START' | 'END';
    /** Absolute trigger, ISO. */
    triggerAbsolute?: string;
    repeat?: number;
    duration?: string;
    summary?: string;
    description?: string;
    /** RFC 9074 UID / ACKNOWLEDGED / RELATED-TO / PROXIMITY. */
    uid?: string;
    acknowledged?: string;
    proximity?: string;
    extraProperties: IcsJCalProperty[];
}

export interface IcsAttachmentModel {
    uri?: string;
    /** Inline base64 data is not copied into the model, only its size; the raw property stays in `jcal`. */
    inlineDataLength?: number;
    formatType?: string;
    filename?: string;
    size?: number;
    extraParameters: IcsJCalParameters;
}

export interface IcsConferenceModel {
    uri: string;
    /** RFC 7986 FEATURE values, e.g. AUDIO, VIDEO, CHAT, PHONE, MODERATOR. */
    features: string[];
    label?: string;
    /** Where the conference came from: RFC 7986 CONFERENCE or a vendor property. */
    source:
        | 'CONFERENCE'
        | 'X-GOOGLE-CONFERENCE'
        | 'X-MICROSOFT-SKYPETEAMSMEETINGURL'
        | 'X-MICROSOFT-ONLINEMEETINGCONFLINK'
        | 'DESCRIPTION';
}

export interface IcsGeoModel {
    latitude: number;
    longitude: number;
}

/** RFC 9073 structured location / X-APPLE-STRUCTURED-LOCATION. */
export interface IcsStructuredLocationModel {
    name?: string;
    address?: string;
    geo?: IcsGeoModel;
    radius?: number;
    uri?: string;
    source: 'X-APPLE-STRUCTURED-LOCATION' | 'VLOCATION';
}

export interface IcsRelationModel {
    uid: string;
    /** RELTYPE: PARENT, CHILD, SIBLING, or RFC 9253 values. */
    relationType?: string;
}

/** Decoded vendor extensions. The original properties are still kept in `extraProperties`. */
export interface IcsVendorExtensions {
    /** X-ALT-DESC;FMTTYPE=text/html or RFC 9073 STYLED-DESCRIPTION. */
    htmlDescription?: string;
    /** X-MICROSOFT-CDO-BUSYSTATUS: FREE, TENTATIVE, BUSY, OOF, WORKINGELSEWHERE. */
    microsoftBusyStatus?: string;
    microsoftIntendedStatus?: string;
    microsoftAllDayEvent?: boolean;
    microsoftImportance?: string;
    microsoftOwnerApptId?: string;
    microsoftIsResponseRequested?: boolean;
    /** X-GOOGLE-* conference/meet data. */
    googleConferenceUrl?: string;
    /** X-APPLE-TRAVEL-ADVISORY-BEHAVIOR, X-APPLE-TRAVEL-DURATION, ... */
    appleTravelDuration?: string;
    appleTravelStart?: string;
    /** X-MOZ-* (Thunderbird) snooze/generation data. */
    mozillaGeneration?: number;
    mozillaLastAck?: string;
    /** X-MYHUB-DETAILS (my-hub). */
    myHubDetails?: string;
}

export interface IcsComponentModel {
    componentType: IcsComponentType;
    uid?: string;

    /** Set on overrides of a recurring series (RECURRENCE-ID). */
    recurrenceId?: IcsDateValue;
    /** RANGE=THISANDFUTURE on RECURRENCE-ID. */
    recurrenceRange?: string;

    summary?: string;
    description?: string;
    location?: string;
    /** ALTREP parameter of LOCATION. */
    locationAltRep?: string;
    url?: string;
    status?: string;
    classification?: string;
    transparency?: string;
    priority?: number;
    sequence?: number;
    /** RFC 7986 COLOR. */
    color?: string;
    categories: string[];
    resources: string[];
    comments: string[];
    contacts: string[];
    geo?: IcsGeoModel;
    structuredLocations: IcsStructuredLocationModel[];
    /** RFC 7986 IMAGE URIs. */
    images: string[];

    start?: IcsDateValue;
    end?: IcsDateValue;
    /** Duration text, e.g. `PT1H30M`. */
    duration?: string;
    /** VTODO */
    due?: IcsDateValue;
    completed?: string;
    percentComplete?: number;

    /** RRULE value text(s), e.g. `FREQ=WEEKLY;COUNT=10;BYDAY=MO`. */
    recurrenceRules: string[];
    /** Deprecated EXRULE values (RFC 2445), still found in old exports. */
    exceptionRules: string[];
    recurrenceDates: IcsDateValue[];
    exceptionDates: IcsDateValue[];
    relations: IcsRelationModel[];

    /** ISO instants. */
    timestamp?: string;
    created?: string;
    lastModified?: string;

    organizer?: IcsParticipantModel;
    attendees: IcsParticipantModel[];
    alarms: IcsAlarmModel[];
    attachments: IcsAttachmentModel[];
    conferences: IcsConferenceModel[];

    vendor: IcsVendorExtensions;

    /** Properties not consumed into a typed field (verbatim jCal). */
    extraProperties: IcsJCalProperty[];
    /** Subcomponents other than VALARM (e.g. VLOCATION, PARTICIPANT, VRESOURCE), verbatim jCal. */
    extraComponents: IcsJCalComponent[];
}

export interface IcsParseWarning {
    uid?: string;
    message: string;
}

export interface IcsDocumentModel {
    calendar: IcsCalendarModel;
    timezones: IcsTimezoneModel[];
    components: IcsComponentModel[];
    warnings: IcsParseWarning[];
}

/** One concrete occurrence of a VEVENT (a single event, or one instance of a recurring series). */
export interface IcsOccurrenceModel {
    uid?: string;
    /** Stable per-instance key: `''` for non-recurring events, otherwise the recurrence-id in UTC basic format. */
    recurrenceKey: string;
    isRecurring: boolean;
    /** True when this instance comes from an override (RECURRENCE-ID) component. */
    isOverride: boolean;
    allDay: boolean;
    startIso: string;
    endIso?: string;
    /** The component the instance's details come from (override if present, otherwise the master). */
    component: IcsComponentModel;
}

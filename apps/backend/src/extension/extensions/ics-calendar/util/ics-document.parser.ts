import ICAL from 'ical.js';
import type {
    IcsAlarmModel,
    IcsAttachmentModel,
    IcsCalendarModel,
    IcsComponentModel,
    IcsComponentType,
    IcsConferenceModel,
    IcsDateValue,
    IcsDocumentModel,
    IcsJCalComponent,
    IcsJCalParameters,
    IcsJCalProperty,
    IcsParseWarning,
    IcsParticipantModel,
    IcsStructuredLocationModel,
    IcsTimezoneModel,
} from '@bytebunker/event-schema/extension/ics';
import { buildTimezoneContext, type IcsTimezoneContext, resolveIcsDate, resolveTzidToIana } from './ics-timezone.util.js';

export interface ParseIcsDocumentOptions {
    /** IANA zone for floating and DATE values when the calendar does not declare X-WR-TIMEZONE. */
    floatingZone: string;
}

const COMPONENT_TYPES = new Set<string>(['vevent', 'vtodo', 'vjournal', 'vfreebusy', 'vavailability']);

/**
 * Parses a complete .ics document (any number of VCALENDARs, components and UIDs) into an `IcsDocumentModel`.
 *
 * Unlike a CalDAV resource codec this is tolerant: a component that cannot be read becomes a warning instead of
 * failing the whole file, and nothing is validated against the component type. Every property that does not fit
 * a typed field is kept verbatim (jCal) in `extraProperties`.
 */
export function parseIcsDocument(rawIcs: string, options: ParseIcsDocumentOptions): IcsDocumentModel {
    return parseIcsDocumentWithSources(rawIcs, options).document;
}

export interface ParsedIcsDocumentWithSources {
    document: IcsDocumentModel;
    /** Timezone context the document was resolved with (needed for recurrence expansion). */
    context: IcsTimezoneContext;
    /** Each parsed component together with its original jCal. */
    sources: { model: IcsComponentModel; jcal: IcsJCalComponent }[];
}

export function parseIcsDocumentWithSources(rawIcs: string, options: ParseIcsDocumentOptions): ParsedIcsDocumentWithSources {
    const parsed = ICAL.parse(normalizeRawIcs(rawIcs)) as IcsJCalComponent | IcsJCalComponent[];
    const roots = (isComponentList(parsed) ? parsed : [parsed]).filter((root) => root[0] === 'vcalendar');

    if (!roots.length) {
        throw new Error('No VCALENDAR found in iCalendar data');
    }

    const warnings: IcsParseWarning[] = [];
    const calendar = parseCalendarProperties(roots.flatMap((root) => root[1]));
    const vtimezones = roots.flatMap((root) => root[2].filter((component) => component[0] === 'vtimezone'));
    const floatingZone = resolveTzidToIana(calendar.defaultTimezone) ?? options.floatingZone;
    const context = buildTimezoneContext(vtimezones, floatingZone);

    const timezones = vtimezones.map((vtimezone): IcsTimezoneModel => {
        const tzid = String(vtimezone[1].find((property) => property[0] === 'tzid')?.[3] ?? '');
        const resolvedZone = resolveTzidToIana(tzid);

        return { tzid, jcal: vtimezone, ...(resolvedZone ? { resolvedZone } : {}) };
    });

    const sources: { model: IcsComponentModel; jcal: IcsJCalComponent }[] = [];

    for (const root of roots) {
        for (const jcalComponent of root[2]) {
            if (!COMPONENT_TYPES.has(jcalComponent[0])) {
                if (jcalComponent[0] !== 'vtimezone') {
                    warnings.push({ message: `Skipped unsupported top-level component ${jcalComponent[0].toUpperCase()}` });
                }
                continue;
            }

            try {
                sources.push({ model: parseIcsComponent(jcalComponent, context, warnings), jcal: jcalComponent });
            } catch (error) {
                warnings.push({
                    uid: findUid(jcalComponent),
                    message: `Could not parse ${jcalComponent[0].toUpperCase()}: ${(error as Error).message}`,
                });
            }
        }
    }

    return {
        document: { calendar, timezones, components: sources.map((source) => source.model), warnings },
        context,
        sources,
    };
}

/** Repairs common producer quirks that make the strict ical.js tokenizer throw. */
function normalizeRawIcs(rawIcs: string): string {
    return (
        rawIcs
            // Byte order mark
            .replace(/^﻿/, '')
            // Bare LF / CR line endings
            .replace(/\r\n|\r|\n/g, '\r\n')
            // Blank lines between content lines (not allowed, but written by some exporters)
            .replace(/(\r\n){2,}/g, '\r\n')
    );
}

function isComponentList(value: IcsJCalComponent | IcsJCalComponent[]): value is IcsJCalComponent[] {
    return Array.isArray(value[0]);
}

function findUid(component: IcsJCalComponent): string | undefined {
    const uid = component[1].find((property) => property[0] === 'uid')?.[3];

    return typeof uid === 'string' ? uid : undefined;
}

function parseCalendarProperties(properties: IcsJCalProperty[]): IcsCalendarModel {
    const calendar: IcsCalendarModel = { extraProperties: [] };

    for (const property of properties) {
        const [name] = property;
        const value = firstValue(property);

        switch (name) {
            case 'prodid':
                calendar.prodId ??= value;
                break;
            case 'version':
                calendar.version ??= value;
                break;
            case 'calscale':
                calendar.calScale ??= value;
                break;
            case 'method':
                calendar.method ??= value;
                break;
            case 'name':
            case 'x-wr-calname':
                calendar.name ??= value;
                break;
            case 'description':
            case 'x-wr-caldesc':
                calendar.description ??= value;
                break;
            case 'x-wr-timezone':
                calendar.defaultTimezone ??= value;
                break;
            case 'color':
            case 'x-apple-calendar-color':
                calendar.color ??= value;
                break;
            case 'uid':
            case 'x-wr-relcalid':
                calendar.uid ??= value;
                break;
            case 'url':
                calendar.url ??= value;
                break;
            case 'source':
                calendar.source ??= value;
                break;
            case 'refresh-interval':
            case 'x-published-ttl':
                calendar.refreshInterval ??= value;
                break;
            case 'last-modified':
                calendar.lastModified ??= value;
                break;
            default:
                calendar.extraProperties.push(property);
        }
    }

    return calendar;
}

/** Parameters a typed field accounts for; a property with any other parameter is additionally kept verbatim. */
const CONSUMED_PARAMETERS: Record<string, string[]> = {
    dtstart: ['tzid', 'value'],
    dtend: ['tzid', 'value'],
    due: ['tzid', 'value'],
    'recurrence-id': ['tzid', 'value', 'range'],
    rdate: ['tzid', 'value'],
    exdate: ['tzid', 'value'],
    location: ['altrep'],
    'related-to': ['reltype'],
};

export function parseIcsComponent(
    jcalComponent: IcsJCalComponent,
    context: IcsTimezoneContext,
    warnings: IcsParseWarning[] = [],
): IcsComponentModel {
    const [componentName, properties, subcomponents] = jcalComponent;

    const component: IcsComponentModel = {
        componentType: componentName.toUpperCase() as IcsComponentType,
        categories: [],
        resources: [],
        comments: [],
        contacts: [],
        structuredLocations: [],
        images: [],
        recurrenceRules: [],
        exceptionRules: [],
        recurrenceDates: [],
        exceptionDates: [],
        relations: [],
        attendees: [],
        alarms: [],
        attachments: [],
        conferences: [],
        vendor: {},
        extraProperties: [],
        extraComponents: [],
    };

    const date = (property: IcsJCalProperty): IcsDateValue | undefined => {
        const value = property[3];

        if (typeof value !== 'string') {
            return undefined;
        }

        const resolved = resolveIcsDate(value, property[2], parameterString(property, 'tzid'), context);

        if (!resolved) {
            warnings.push({ uid: component.uid, message: `Unparseable ${property[0].toUpperCase()} value ${value}` });
        }

        return resolved?.value;
    };

    for (const property of properties) {
        const [name] = property;
        const value = firstValue(property);
        let consumed = true;

        switch (name) {
            case 'uid':
                component.uid = value;
                break;
            case 'summary':
                component.summary = value;
                break;
            case 'description':
                component.description = value;
                break;
            case 'location':
                component.location = value;
                component.locationAltRep = parameterString(property, 'altrep');
                break;
            case 'url':
                component.url = value;
                break;
            case 'status':
                component.status = value?.toUpperCase();
                break;
            case 'class':
                component.classification = value?.toUpperCase();
                break;
            case 'transp':
                component.transparency = value?.toUpperCase();
                break;
            case 'priority':
                component.priority = toNumber(property[3]);
                break;
            case 'sequence':
                component.sequence = toNumber(property[3]);
                break;
            case 'color':
                component.color = value;
                break;
            case 'categories':
                component.categories.push(...allStringValues(property));
                break;
            case 'resources':
                component.resources.push(...allStringValues(property));
                break;
            case 'comment':
                component.comments.push(...allStringValues(property));
                break;
            case 'contact':
                component.contacts.push(...allStringValues(property));
                break;
            case 'image':
                if (value) component.images.push(value);
                break;
            case 'geo': {
                const geo = property[3];
                if (Array.isArray(geo) && geo.length === 2) {
                    component.geo = { latitude: Number(geo[0]), longitude: Number(geo[1]) };
                }
                break;
            }
            case 'dtstart':
                component.start = date(property);
                break;
            case 'dtend':
                component.end = date(property);
                break;
            case 'due':
                component.due = date(property);
                break;
            case 'duration':
                component.duration = value;
                break;
            case 'completed':
                component.completed = date(property)?.iso;
                break;
            case 'percent-complete':
                component.percentComplete = toNumber(property[3]);
                break;
            case 'recurrence-id':
                component.recurrenceId = date(property);
                component.recurrenceRange = parameterString(property, 'range');
                break;
            case 'rrule':
                component.recurrenceRules.push(recurToText(property[3]));
                break;
            case 'exrule':
                component.exceptionRules.push(recurToText(property[3]));
                break;
            case 'rdate':
            case 'exdate': {
                const target = name === 'rdate' ? component.recurrenceDates : component.exceptionDates;
                const tzid = parameterString(property, 'tzid');

                for (const rawValue of property.slice(3)) {
                    // PERIOD values (rdate only) stay verbatim in extraProperties.
                    if (typeof rawValue !== 'string') {
                        consumed = false;
                        continue;
                    }

                    const resolved = resolveIcsDate(rawValue, property[2], tzid, context);
                    if (resolved) target.push(resolved.value);
                }
                break;
            }
            case 'related-to':
                if (value) {
                    const relationType = parameterString(property, 'reltype');
                    component.relations.push({ uid: value, ...(relationType ? { relationType } : {}) });
                }
                break;
            case 'dtstamp':
                component.timestamp = date(property)?.iso;
                break;
            case 'created':
                component.created = date(property)?.iso;
                break;
            case 'last-modified':
                component.lastModified = date(property)?.iso;
                break;
            case 'organizer':
                component.organizer = parseParticipant(property, 'organizer');
                break;
            case 'attendee':
                component.attendees.push(parseParticipant(property, 'attendee'));
                break;
            case 'attach':
                component.attachments.push(parseAttachment(property));
                break;
            case 'conference':
                if (value) {
                    const label = parameterString(property, 'label');
                    component.conferences.push({
                        uri: value,
                        features: parameterList(property, 'feature'),
                        source: 'CONFERENCE',
                        ...(label ? { label } : {}),
                    });
                }
                break;
            default:
                consumed = false;
                parseVendorProperty(component, property);
        }

        if (!consumed || hasUnconsumedParameters(property)) {
            component.extraProperties.push(property);
        }
    }

    for (const subcomponent of subcomponents) {
        if (subcomponent[0] === 'valarm') {
            component.alarms.push(parseAlarm(subcomponent, context));
        } else {
            if (subcomponent[0] === 'vlocation') {
                const structuredLocation = parseVLocation(subcomponent);
                if (structuredLocation) component.structuredLocations.push(structuredLocation);
            }
            component.extraComponents.push(subcomponent);
        }
    }

    addConferencesFromDescription(component);

    return component;
}

function hasUnconsumedParameters(property: IcsJCalProperty): boolean {
    const [name, parameters] = property;

    if (name === 'organizer' || name === 'attendee' || name === 'attach' || name === 'conference') {
        // Participant/attachment/conference parameters are kept on the parsed model.
        return false;
    }

    const allowed = CONSUMED_PARAMETERS[name] ?? [];

    return Object.keys(parameters).some((parameter) => !allowed.includes(parameter));
}

function parseVendorProperty(component: IcsComponentModel, property: IcsJCalProperty): void {
    const [name] = property;
    const value = firstValue(property);
    const vendor = component.vendor;

    switch (name) {
        case 'x-alt-desc':
        case 'styled-description':
            if (value && /html/i.test(parameterString(property, 'fmttype') ?? 'text/html')) {
                vendor.htmlDescription = value;
            }
            break;
        case 'x-microsoft-cdo-busystatus':
            vendor.microsoftBusyStatus = value;
            break;
        case 'x-microsoft-cdo-intendedstatus':
            vendor.microsoftIntendedStatus = value;
            break;
        case 'x-microsoft-cdo-alldayevent':
            vendor.microsoftAllDayEvent = value?.toUpperCase() === 'TRUE';
            break;
        case 'x-microsoft-cdo-importance':
            vendor.microsoftImportance = value;
            break;
        case 'x-microsoft-cdo-ownerapptid':
            vendor.microsoftOwnerApptId = value;
            break;
        case 'x-microsoft-isresponserequested':
            vendor.microsoftIsResponseRequested = value?.toUpperCase() === 'TRUE';
            break;
        case 'x-microsoft-skypeteamsmeetingurl':
        case 'x-microsoft-onlinemeetingconflink':
            if (value) {
                component.conferences.push({
                    uri: value,
                    features: ['VIDEO'],
                    source: name.toUpperCase() as IcsConferenceModel['source'],
                });
            }
            break;
        case 'x-google-conference':
            if (value) {
                vendor.googleConferenceUrl = value;
                component.conferences.push({ uri: value, features: ['VIDEO'], source: 'X-GOOGLE-CONFERENCE' });
            }
            break;
        case 'x-apple-structured-location': {
            const structuredLocation = parseAppleStructuredLocation(property);
            if (structuredLocation) component.structuredLocations.push(structuredLocation);
            break;
        }
        case 'x-apple-travel-duration':
            vendor.appleTravelDuration = value;
            break;
        case 'x-apple-travel-start':
            vendor.appleTravelStart = value;
            break;
        case 'x-moz-generation':
            vendor.mozillaGeneration = toNumber(property[3]);
            break;
        case 'x-moz-lastack':
            vendor.mozillaLastAck = value;
            break;
        case 'x-myhub-details':
            vendor.myHubDetails = value;
            break;
    }
}

function parseAppleStructuredLocation(property: IcsJCalProperty): IcsStructuredLocationModel | undefined {
    const uri = firstValue(property);
    const geo = uri ? parseGeoUri(uri) : undefined;
    const name = parameterString(property, 'x-title');
    const address = parameterString(property, 'x-address');
    const radius = toNumber(parameterString(property, 'x-apple-radius'));

    if (!geo && !name && !address) {
        return undefined;
    }

    return {
        source: 'X-APPLE-STRUCTURED-LOCATION',
        ...(name ? { name } : {}),
        ...(address ? { address } : {}),
        ...(geo ? { geo } : {}),
        ...(radius !== undefined ? { radius } : {}),
        ...(uri && !geo ? { uri } : {}),
    };
}

function parseVLocation(component: IcsJCalComponent): IcsStructuredLocationModel | undefined {
    const property = (name: string) => component[1].find((p) => p[0] === name);
    const name = firstValue(property('name') ?? ['', {}, 'text']);
    const uri = firstValue(property('url') ?? ['', {}, 'text']);
    const geoProperty = property('geo');
    const geo =
        geoProperty && Array.isArray(geoProperty[3])
            ? { latitude: Number(geoProperty[3][0]), longitude: Number(geoProperty[3][1]) }
            : uri
              ? parseGeoUri(uri)
              : undefined;

    if (!name && !uri && !geo) {
        return undefined;
    }

    return {
        source: 'VLOCATION',
        ...(name ? { name } : {}),
        ...(geo ? { geo } : {}),
        ...(uri ? { uri } : {}),
    };
}

function parseGeoUri(uri: string): { latitude: number; longitude: number } | undefined {
    const match = /^geo:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i.exec(uri.trim());

    return match ? { latitude: Number(match[1]), longitude: Number(match[2]) } : undefined;
}

const PARTICIPANT_PARAMETERS = new Set([
    'cn',
    'partstat',
    'role',
    'rsvp',
    'cutype',
    'sent-by',
    'delegated-to',
    'delegated-from',
    'member',
    'dir',
    'language',
]);

function parseParticipant(property: IcsJCalProperty, role: IcsParticipantModel['role']): IcsParticipantModel {
    const calAddress = firstValue(property) ?? '';
    const address = calAddress.replace(/^mailto:/i, '').trim();
    const email = address.includes('@') ? address.toLowerCase() : undefined;
    const rsvp = parameterString(property, 'rsvp');
    const extraParameters: IcsJCalParameters = {};

    for (const [parameter, parameterValue] of Object.entries(property[1])) {
        if (!PARTICIPANT_PARAMETERS.has(parameter)) {
            extraParameters[parameter] = parameterValue;
        }
    }

    const optional = {
        email,
        name: parameterString(property, 'cn'),
        participationStatus: parameterString(property, 'partstat')?.toUpperCase(),
        participationRole: parameterString(property, 'role')?.toUpperCase(),
        rsvp: rsvp ? rsvp.toUpperCase() === 'TRUE' : undefined,
        calendarUserType: parameterString(property, 'cutype')?.toUpperCase(),
        sentBy: parameterString(property, 'sent-by'),
        directory: parameterString(property, 'dir'),
        language: parameterString(property, 'language'),
    };
    const lists = {
        delegatedTo: parameterList(property, 'delegated-to'),
        delegatedFrom: parameterList(property, 'delegated-from'),
        member: parameterList(property, 'member'),
    };

    return {
        role,
        calAddress,
        extraParameters,
        ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)),
        ...Object.fromEntries(Object.entries(lists).filter(([, v]) => v.length > 0)),
    } as IcsParticipantModel;
}

function parseAttachment(property: IcsJCalProperty): IcsAttachmentModel {
    const isBinary = property[2] === 'binary' || parameterString(property, 'encoding')?.toUpperCase() === 'BASE64';
    const value = firstValue(property);
    const formatType = parameterString(property, 'fmttype');
    const filename = parameterString(property, 'filename') ?? parameterString(property, 'x-filename');
    const size = toNumber(parameterString(property, 'size') ?? parameterString(property, 'x-apple-filesize'));
    const extraParameters: IcsJCalParameters = {};

    for (const [parameter, parameterValue] of Object.entries(property[1])) {
        if (!['fmttype', 'filename', 'x-filename', 'size', 'encoding', 'value'].includes(parameter)) {
            extraParameters[parameter] = parameterValue;
        }
    }

    return {
        extraParameters,
        ...(isBinary ? { inlineDataLength: value?.length ?? 0 } : value ? { uri: value } : {}),
        ...(formatType ? { formatType } : {}),
        ...(filename ? { filename } : {}),
        ...(size !== undefined ? { size } : {}),
    };
}

function parseAlarm(jcalComponent: IcsJCalComponent, context: IcsTimezoneContext): IcsAlarmModel {
    const alarm: IcsAlarmModel = { extraProperties: [] };

    for (const property of jcalComponent[1]) {
        const value = firstValue(property);

        switch (property[0]) {
            case 'action':
                alarm.action = value?.toUpperCase();
                break;
            case 'trigger':
                if (property[2] === 'date-time' && value) {
                    alarm.triggerAbsolute = resolveIcsDate(value, 'date-time', undefined, context)?.value.iso;
                } else {
                    alarm.triggerRelative = value;
                    const related = parameterString(property, 'related')?.toUpperCase();
                    if (related === 'START' || related === 'END') alarm.triggerRelatedTo = related;
                }
                break;
            case 'repeat':
                alarm.repeat = toNumber(property[3]);
                break;
            case 'duration':
                alarm.duration = value;
                break;
            case 'summary':
                alarm.summary = value;
                break;
            case 'description':
                alarm.description = value;
                break;
            case 'uid':
                alarm.uid = value;
                break;
            case 'acknowledged':
                alarm.acknowledged = value ? resolveIcsDate(value, 'date-time', undefined, context)?.value.iso : undefined;
                break;
            case 'proximity':
                alarm.proximity = value;
                break;
            default:
                alarm.extraProperties.push(property);
        }
    }

    return alarm;
}

const MEETING_URL_PATTERN =
    /https:\/\/(?:meet\.google\.com\/[a-z-]+|[\w.-]*zoom\.us\/(?:j|my)\/[^\s<>"]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"]+|[\w.-]*webex\.com\/[^\s<>"]+|meet\.jit\.si\/[^\s<>"]+)/gi;

/** Meeting links that only appear in the description text (common for invitations) become conferences too. */
function addConferencesFromDescription(component: IcsComponentModel): void {
    const text = [component.description, component.location].filter(Boolean).join('\n');
    const known = new Set(component.conferences.map((conference) => conference.uri));

    for (const match of text.matchAll(MEETING_URL_PATTERN)) {
        const uri = match[0].replace(/[).,;]+$/, '');

        if (!known.has(uri)) {
            known.add(uri);
            component.conferences.push({ uri, features: ['VIDEO'], source: 'DESCRIPTION' });
        }
    }
}

function firstValue(property: IcsJCalProperty): string | undefined {
    const value = property[3];

    if (value === undefined || value === null) {
        return undefined;
    }

    const text = typeof value === 'object' ? recurToText(value) : String(value);

    return text.length ? text : undefined;
}

function allStringValues(property: IcsJCalProperty): string[] {
    return property
        .slice(3)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => String(value).trim())
        .filter(Boolean);
}

function parameterString(property: IcsJCalProperty, name: string): string | undefined {
    const value = property[1][name];
    const first = Array.isArray(value) ? value[0] : value;

    return typeof first === 'string' && first.length ? first : undefined;
}

function parameterList(property: IcsJCalProperty, name: string): string[] {
    const value = property[1][name];

    if (value === undefined) {
        return [];
    }

    return (Array.isArray(value) ? value : value.split(',')).map((v) => v.trim()).filter(Boolean);
}

function toNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : undefined;
}

/** jCal recur values are objects (`{ freq: 'WEEKLY', byday: ['MO'] }`); turn them back into RRULE text. */
function recurToText(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }

    if (value && typeof value === 'object') {
        try {
            return ICAL.Recur.fromData(value as never).toString();
        } catch {
            return JSON.stringify(value);
        }
    }

    return String(value);
}

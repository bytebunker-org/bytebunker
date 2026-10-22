import ICAL from 'ical.js';
import { DateTime, Duration } from 'luxon';
import type {
    IcsComponentModel,
    IcsDateValue,
    IcsJCalComponent,
    IcsJCalProperty,
    IcsOccurrenceModel,
} from '@bytebunker/event-schema/extension/ics';
import { buildRecurrenceKey, type IcsTimezoneContext, resolveIcsDate, type ResolvedIcsDate } from './ics-timezone.util.js';

export interface ExpandIcsOccurrencesOptions {
    /** Recurring series are expanded up to (excluding) this instant. */
    until: DateTime;
    /** Safety cap for instances per series (rules without COUNT/UNTIL, broken rules). */
    maxOccurrencesPerSeries: number;
    /** Keep events/instances with STATUS:CANCELLED. */
    includeCancelled: boolean;
}

export interface ExpandIcsOccurrencesResult {
    occurrences: IcsOccurrenceModel[];
    /** Series whose expansion stopped at `maxOccurrencesPerSeries` before reaching `until`. */
    truncatedSeriesUids: string[];
}

/**
 * Expands parsed VEVENTs into concrete occurrences: single events pass through, recurring masters are expanded
 * (RRULE, RDATE, EXDATE) and their instances replaced by RECURRENCE-ID overrides. Overrides whose master is
 * missing (common in partial exports and invitations) are emitted as standalone occurrences.
 *
 * `jcalByComponent` must map each parsed master to its original jCal component; ical.js does the rule iteration
 * on it, while times are resolved with the file's timezone context so unknown TZIDs behave consistently.
 */
export function expandIcsOccurrences(
    components: { model: IcsComponentModel; jcal: IcsJCalComponent }[],
    context: IcsTimezoneContext,
    options: ExpandIcsOccurrencesOptions,
): ExpandIcsOccurrencesResult {
    const events = components.filter(({ model }) => model.componentType === 'VEVENT' && model.start);
    const overridesByUid = new Map<string, Map<string, IcsComponentModel>>();

    for (const { model } of events) {
        if (model.recurrenceId && model.uid) {
            const resolved = resolveIcsDate(
                basicToJCal(model.recurrenceId.value),
                model.recurrenceId.kind === 'date' ? 'date' : 'date-time',
                model.recurrenceId.tzid,
                context,
            );

            if (resolved) {
                const overrides = overridesByUid.get(model.uid) ?? new Map<string, IcsComponentModel>();
                overrides.set(buildRecurrenceKey(resolved), model);
                overridesByUid.set(model.uid, overrides);
            }
        }
    }

    const occurrences: IcsOccurrenceModel[] = [];
    const truncatedSeriesUids: string[] = [];
    const usedOverrides = new Set<IcsComponentModel>();

    for (const { model, jcal } of events) {
        if (model.recurrenceId) {
            continue;
        }

        const isRecurring = model.recurrenceRules.length > 0 || model.recurrenceDates.length > 0;

        if (!isRecurring) {
            const occurrence = buildOccurrence(model, model, '', false, false, context);
            if (occurrence) occurrences.push(occurrence);
            continue;
        }

        const overrides = (model.uid && overridesByUid.get(model.uid)) || new Map<string, IcsComponentModel>();
        const masterStart = resolveDateValue(model.start!, context)!;
        const masterDuration = getComponentDuration(model, masterStart, context);
        const iterator = new ICAL.Event(new ICAL.Component(stripOverrides(jcal))).iterator();
        // ical.js compares EXDATEs by wall time; also match them by instant so a UTC EXDATE on a zoned series works.
        const exceptionKeys = new Set(
            model.exceptionDates
                .map((exceptionDate) => resolveDateValue(exceptionDate, context))
                .filter((resolved): resolved is ResolvedIcsDate => Boolean(resolved))
                .map(buildRecurrenceKey),
        );

        let count = 0;
        let next: ICAL.Time | undefined;

        while ((next = iterator.next())) {
            const instanceStart = resolveIcsDate(
                next.toString(),
                next.isDate ? 'date' : 'date-time',
                model.start!.tzid,
                context,
            );

            if (!instanceStart) {
                break;
            }

            if (instanceStart.dateTime >= options.until) {
                break;
            }

            if (++count > options.maxOccurrencesPerSeries) {
                truncatedSeriesUids.push(model.uid ?? '');
                break;
            }

            const recurrenceKey = buildRecurrenceKey(instanceStart);

            if (exceptionKeys.has(recurrenceKey)) {
                continue;
            }

            const override = overrides.get(recurrenceKey);

            if (override) {
                usedOverrides.add(override);
                const occurrence = buildOccurrence(override, model, recurrenceKey, true, true, context);
                if (occurrence) occurrences.push(occurrence);
                continue;
            }

            occurrences.push({
                ...(model.uid ? { uid: model.uid } : {}),
                recurrenceKey,
                isRecurring: true,
                isOverride: false,
                allDay: instanceStart.value.kind === 'date',
                startIso: instanceStart.dateTime.toISO()!,
                ...(masterDuration ? { endIso: instanceStart.dateTime.plus(masterDuration).toISO()! } : {}),
                component: model,
            });
        }
    }

    // Overrides without a (matching) master instance: moved beyond the rule, master missing from the export, etc.
    for (const [, overrides] of overridesByUid) {
        for (const [recurrenceKey, override] of overrides) {
            if (usedOverrides.has(override)) {
                continue;
            }

            const occurrence = buildOccurrence(override, override, recurrenceKey, true, true, context);

            if (occurrence && DateTime.fromISO(occurrence.startIso) < options.until) {
                occurrences.push(occurrence);
            }
        }
    }

    return {
        occurrences: options.includeCancelled
            ? occurrences
            : occurrences.filter((occurrence) => occurrence.component.status !== 'CANCELLED'),
        truncatedSeriesUids,
    };
}

function buildOccurrence(
    component: IcsComponentModel,
    master: IcsComponentModel,
    recurrenceKey: string,
    isRecurring: boolean,
    isOverride: boolean,
    context: IcsTimezoneContext,
): IcsOccurrenceModel | undefined {
    const start = component.start ? resolveDateValue(component.start, context) : undefined;

    if (!start) {
        return undefined;
    }

    const duration = getComponentDuration(component, start, context) ?? getComponentDuration(master, start, context);
    const uid = component.uid ?? master.uid;

    return {
        ...(uid ? { uid } : {}),
        recurrenceKey,
        isRecurring,
        isOverride,
        allDay: start.value.kind === 'date',
        startIso: start.dateTime.toISO()!,
        ...(duration ? { endIso: start.dateTime.plus(duration).toISO()! } : {}),
        component,
    };
}

/** Event length from DTEND or DURATION; DATE-only events without either last one day (RFC 5545 §3.6.1). */
function getComponentDuration(
    component: IcsComponentModel,
    start: ResolvedIcsDate,
    context: IcsTimezoneContext,
): Duration | undefined {
    if (component.end) {
        const end = resolveDateValue(component.end, context);

        if (end && end.dateTime >= start.dateTime) {
            return start.value.kind === 'date'
                ? end.dateTime.diff(start.dateTime, ['days'])
                : end.dateTime.diff(start.dateTime, ['hours', 'minutes', 'seconds']);
        }
    }

    if (component.duration) {
        const duration = Duration.fromISO(component.duration.replace(/^\+/, ''));

        if (duration.isValid && !component.duration.startsWith('-')) {
            return duration;
        }
    }

    return start.value.kind === 'date' ? Duration.fromObject({ days: 1 }) : undefined;
}

function resolveDateValue(value: IcsDateValue, context: IcsTimezoneContext): ResolvedIcsDate | undefined {
    return resolveIcsDate(basicToJCal(value.value), value.kind === 'date' ? 'date' : 'date-time', value.tzid, context);
}

/** `20260901T140000Z` → `2026-09-01T14:00:00Z`, `20260901` → `2026-09-01`. */
function basicToJCal(basic: string): string {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(basic);

    if (!match) {
        return basic;
    }

    const [, year, month, day, hour, minute, second, utc] = match;

    return hour ? `${year}-${month}-${day}T${hour}:${minute}:${second}${utc}` : `${year}-${month}-${day}`;
}

/** The ical.js iterator must not see RECURRENCE-ID handling of other components; a master never has one. */
function stripOverrides(jcal: IcsJCalComponent): IcsJCalComponent {
    return [jcal[0], jcal[1].filter((property: IcsJCalProperty) => property[0] !== 'recurrence-id'), []];
}

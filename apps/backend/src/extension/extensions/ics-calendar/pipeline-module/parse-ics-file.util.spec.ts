import { describe, expect, it } from 'vitest';
import ICAL from 'ical.js';
import {
    extractAttendeeEmail,
    firstParameterString,
    icalTimeToLuxon,
    parseAttendees,
} from './parse-ics-file.util.js';
import {
    ICS_WITH_ALL_DAY_EVENT,
    ICS_WITH_LOCATION_AND_ATTENDEES,
    ICS_WITH_TIMEZONE,
    MINIMAL_ICS,
} from './parse-ics-file.fixture.js';

function firstVEvent(rawIcs: string): ICAL.Event {
    const calendar = new ICAL.Component(ICAL.parse(rawIcs));
    const vevent = calendar.getFirstSubcomponent('vevent');

    if (!vevent) {
        throw new Error('Test fixture has no VEVENT');
    }

    return new ICAL.Event(vevent);
}

describe('parse-ics-file.util', () => {
    describe('icalTimeToLuxon', () => {
        it('returns undefined for null/undefined input', () => {
            expect(icalTimeToLuxon(null)).toBeUndefined();
            expect(icalTimeToLuxon(undefined)).toBeUndefined();
        });

        it('parses UTC datetime to a valid Luxon DateTime', () => {
            const event = firstVEvent(MINIMAL_ICS);

            const start = icalTimeToLuxon(event.startDate);

            expect(start?.isValid).toBe(true);
            expect(start?.toUTC().toISO()).toBe('2025-01-15T10:30:00.000Z');
        });

        it('preserves the named timezone for zoned datetimes', () => {
            const event = firstVEvent(ICS_WITH_TIMEZONE);

            const start = icalTimeToLuxon(event.startDate);

            expect(start?.isValid).toBe(true);
            expect(start?.zoneName).toBe('Europe/Berlin');
            expect(start?.toUTC().toISO()).toBe('2025-06-01T08:00:00.000Z');
        });

        it('treats VALUE=DATE all-day starts as UTC midnight', () => {
            const event = firstVEvent(ICS_WITH_ALL_DAY_EVENT);

            const start = icalTimeToLuxon(event.startDate);

            expect(start?.isValid).toBe(true);
            expect(start?.toUTC().toISO()).toBe('2025-07-04T00:00:00.000Z');
            expect(start?.zoneName).toBe('UTC');
        });
    });

    describe('firstParameterString', () => {
        it('returns the parameter value when set', () => {
            const event = firstVEvent(ICS_WITH_LOCATION_AND_ATTENDEES);
            const attendee = event.attendees[0];

            expect(firstParameterString(attendee, 'cn')).toBe('Alice Johnson');
            expect(firstParameterString(attendee, 'partstat')).toBe('ACCEPTED');
        });

        it('returns undefined when the parameter is missing', () => {
            const event = firstVEvent(MINIMAL_ICS);
            const dtstart = event.component.getFirstProperty('dtstart')!;

            expect(firstParameterString(dtstart, 'tzid')).toBeUndefined();
        });
    });

    describe('extractAttendeeEmail', () => {
        it('strips the mailto: prefix case-insensitively', () => {
            const event = firstVEvent(ICS_WITH_LOCATION_AND_ATTENDEES);
            const [first] = event.attendees;

            expect(extractAttendeeEmail(first)).toBe('alice@example.com');
        });
    });

    describe('parseAttendees', () => {
        it('returns an empty array when no attendees are provided', () => {
            expect(parseAttendees(undefined)).toEqual([]);
            expect(parseAttendees([])).toEqual([]);
        });

        it('parses email, name, and status from each attendee', () => {
            const event = firstVEvent(ICS_WITH_LOCATION_AND_ATTENDEES);

            const attendees = parseAttendees(event.attendees);

            expect(attendees).toEqual([
                { email: 'alice@example.com', name: 'Alice Johnson', status: 'ACCEPTED' },
                { email: 'bob@example.com', name: 'Bob Smith', status: 'NEEDS-ACTION' },
                { email: 'carol@example.com', status: 'DECLINED' },
            ]);
        });
    });
});

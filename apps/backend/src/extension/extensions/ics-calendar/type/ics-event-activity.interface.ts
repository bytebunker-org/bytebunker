import type { IcsComponentModel } from '@bytebunker/event-schema/extension/ics';

export interface IcsEventAttendee {
    name?: string;
    email: string;
    /** PARTSTAT */
    status?: string;
    /** ROLE */
    role?: string;
    /** CUTYPE */
    type?: string;
}

/**
 * secondary type: IcsEvent (activity type Event)
 */
export interface IcsEventActivityInterface {
    allDay: boolean;
    /** VEVENT STATUS: TENTATIVE, CONFIRMED, CANCELLED. */
    status?: string;
    /** URL property; not `url` because AS `url` expects a Link object. */
    eventUrl?: string;
    categories?: string[];
    attendees?: IcsEventAttendee[];
    organizer?: IcsEventAttendee;
    conferenceUrl?: string;
    icsUid?: string;
    /** Set for instances of recurring series, see `IcsOccurrenceModel.recurrenceKey`. */
    icsRecurrenceKey?: string;
    isRecurring: boolean;
    calendarName?: string;
    /** The full parsed component (master or override) this occurrence comes from. */
    ics: IcsComponentModel;
}

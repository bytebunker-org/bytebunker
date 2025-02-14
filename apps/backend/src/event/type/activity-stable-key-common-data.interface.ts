import type { DateTime } from 'luxon';

export interface ActivityStableKeyCommonDataInterface {
    lat?: number;

    lng?: number;

    start?: DateTime;

    end?: DateTime;
}

import { Injectable } from '@nestjs/common';
import { type ASObject, type ASObjectType, createUnknownASType } from '@bytebunker/event-schema';
import { EntityManager } from '@mikro-orm/postgresql';
import { UserService } from '../user/user.service.js';
import { hashStableKey } from '../util/stable-key-hash.util.js';
import type { ActivityStableKeyCommonDataInterface } from './type/activity-stable-key-common-data.interface.js';
import { getGlobalSettings } from '../shared/setting/global-setting.constant.js';
import type { DateTime, DateTimeUnit } from 'luxon';
import type { ASObjectStableKeyCommonDataInterface } from './type/as-object-stable-key-common-data.interface.js';

@Injectable()
export class ActivityStableKeyService {
    constructor(
        private readonly em: EntityManager,
        private readonly userService: UserService,
    ) {}

    public createActivityStableKey(
        primaryNodeType: ASObjectType,
        data: ActivityStableKeyCommonDataInterface & Record<string, unknown>,
        precisionOptions: { locationPrecision?: number; dateTimePrecision?: DateTimeUnit } = {},
    ): string {
        return hashStableKey([
            primaryNodeType,
            {
                ...data,
                ...(data.lat ? { lat: this.stabilizeLatitudeLongitude(data.lat, precisionOptions) } : {}),
                ...(data.lng ? { lng: this.stabilizeLatitudeLongitude(data.lng, precisionOptions) } : {}),
                ...(data.start ? { start: this.stabilizeDateTime(data.start, precisionOptions) } : {}),
                ...(data.end ? { end: this.stabilizeDateTime(data.end, precisionOptions) } : {}),
            },
        ]);
    }

    public stabilizeLatitudeLongitude(
        latitudeOrLongitude: number,
        precisionOptions: {
            locationPrecision?: number;
        } = {},
    ): string {
        const { eventUniqueLocationPrecisionSetting } = getGlobalSettings();

        const locationPrecision = precisionOptions.locationPrecision ?? eventUniqueLocationPrecisionSetting;
        return latitudeOrLongitude.toFixed(locationPrecision);
    }

    public stabilizeDateTime(
        dateTime: DateTime,
        precisionOptions: {
            dateTimePrecision?: DateTimeUnit;
        } = {},
    ): string {
        const { eventUniqueDateTimePrecisionSetting } = getGlobalSettings();

        const dateTimePrecision =
            precisionOptions.dateTimePrecision ?? (eventUniqueDateTimePrecisionSetting as DateTimeUnit);
        // TODO: Round datetime correctly instead of basically truncating?
        const roundedDateTime = dateTime.toUTC().startOf(dateTimePrecision);

        const dateUnits: DateTimeUnit[] = ['year', 'quarter', 'month', 'week', 'day'];

        if (dateUnits.includes(dateTimePrecision)) {
            return roundedDateTime.toISODate() ?? '';
        } else {
            const suppressSeconds = dateTimePrecision !== 'second' && dateTimePrecision !== 'millisecond';
            const suppressMilliseconds = dateTimePrecision !== 'millisecond';

            return roundedDateTime.toISO({ suppressSeconds, suppressMilliseconds }) ?? '';
        }
    }

    public createASObjectStableKey(
        primaryNodeType: ASObjectType,
        data: ASObjectStableKeyCommonDataInterface & Record<string, unknown>,
        precisionOptions: { locationPrecision?: number } = {},
    ): string {
        const { eventUniqueLocationPrecisionSetting } = getGlobalSettings();

        const locationPrecision = precisionOptions.locationPrecision ?? eventUniqueLocationPrecisionSetting;

        return hashStableKey([
            primaryNodeType,
            {
                ...data,
                ...(data.lat ? { lat: data.lat.toFixed(locationPrecision) } : {}),
                ...(data.lng ? { lng: data.lng.toFixed(locationPrecision) } : {}),
            },
        ]);
    }
}

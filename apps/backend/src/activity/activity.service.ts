import { Injectable } from '@nestjs/common';
import { type ASObject, type ASObjectType, createUnknownASType } from '@bytebunker/event-schema';
import { EntityManager } from '@mikro-orm/postgresql';
import { UserService } from '../user/user.service.js';
import { hashStableKey } from '../util/stable-key-hash.util.js';
import type { ActivityStableKeyCommonDataInterface } from './type/activity-stable-key-common-data.interface.js';
import { getGlobalSettings } from '../shared/setting/global-setting.constant.js';
import type { DateTimeUnit } from 'luxon';
import type { ASObjectStableKeyCommonDataInterface } from './type/as-object-stable-key-common-data.interface.js';

@Injectable()
export class ActivityService {
    constructor(
        private readonly em: EntityManager,
        private readonly userService: UserService,
    ) {}

    public getExtension(id: string): ASObject {
        return {
            '@id': `extension/${id}`,
            '@type': createUnknownASType('Extension'),
        } satisfies ASObject;
    }

    public createActivityStableKey(
        primaryNodeType: ASObjectType,
        data: ActivityStableKeyCommonDataInterface & Record<string, unknown>,
        precisionOptions: { locationPrecision?: number; dateTimePrecision?: DateTimeUnit } = {},
    ): string {
        const { eventUniqueLocationPrecisionSetting, eventUniqueDateTimePrecisionSetting } = getGlobalSettings();

        const locationPrecision = precisionOptions.locationPrecision ?? eventUniqueLocationPrecisionSetting;
        const dateTimePrecision =
            precisionOptions.dateTimePrecision ?? (eventUniqueDateTimePrecisionSetting as DateTimeUnit);

        return hashStableKey([
            primaryNodeType,
            {
                ...data,
                ...(data.lat ? { lat: data.lat.toFixed(locationPrecision) } : {}),
                ...(data.lng ? { lng: data.lng.toFixed(locationPrecision) } : {}),
                // TODO: Round datetime correctly instead of basically truncating?
                ...(data.start ? { start: data.start.startOf(dateTimePrecision) } : {}),
                ...(data.end ? { end: data.end.startOf(dateTimePrecision) } : {}),
            },
        ]);
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

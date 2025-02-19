import type { ASObject, ASObjectType } from '@bytebunker/event-schema';
import type { ActivityDto } from '../dto/activity.dto.js';

export interface RequiredActivityGraphObjectInterface {
    id?: string;

    type?: ASObjectType;

    originalObject: ASObject;
}
export interface RequiredActivityGraphInterface {
    activity: ActivityDto;
    requiredObjects: Record<string, RequiredActivityGraphObjectInterface>;
    requiredStableKeys: string[];
}

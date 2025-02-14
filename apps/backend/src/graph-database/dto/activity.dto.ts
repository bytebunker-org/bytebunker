import type { ASObject, ASObjectType, ObjectOrLink } from '@bytebunker/event-schema';
import { Items, Optional, Required, Type } from 'ts-decorator-json-schema-generator';

export class ActivityDto implements ASObject {
    @Required()
    public '@type'!: ASObjectType;

    @Optional()
    @Items('string')
    public '@secondaryTypes'?: ASObjectType[];

    @Required()
    @Type('object')
    public actor!: ObjectOrLink | ObjectOrLink[];
}

export type ActivityDataType = ActivityDto & ASObject;

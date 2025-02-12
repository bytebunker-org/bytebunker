import type { ASObject } from '@bytebunker/event-schema';
import { Items, Optional, Required } from 'ts-decorator-json-schema-generator';

export class ActivityDto implements ASObject {
    @Required()
    public '@type'!: string;

    @Optional()
    @Items('string')
    public '@secondaryTypes'?: string[];
}

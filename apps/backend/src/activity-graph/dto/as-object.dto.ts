import type { ASObject, ASObjectType } from '@bytebunker/event-schema';

export class ASObjectDto implements ASObject {
    '@id': string;

    '@type': ASObjectType;
}

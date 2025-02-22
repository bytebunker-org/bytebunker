import type { PlaceNodeType } from './place.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

export const GooglePlaceSchema = {
    placeId: 'string',
} satisfies SchemaObject;

export type GooglePlaceNodeType = InferGraphEntityType<typeof GooglePlaceSchema> & PlaceNodeType;

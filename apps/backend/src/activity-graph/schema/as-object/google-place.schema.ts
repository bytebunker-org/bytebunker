import type { InferGraphEntityType, SchemaObject } from '../../../../../../../neode/lib/types/index.js';
import type { PlaceNodeType } from './place.schema.js';

export const GooglePlaceSchema = {
    placeId: 'string',
} satisfies SchemaObject;

export type GooglePlaceNodeType = InferGraphEntityType<typeof GooglePlaceSchema> & PlaceNodeType;

import type { InferGraphEntityType, SchemaObject } from '../../../../../../../neode/lib/types/index.js';
import type { StringSchema } from 'joi';
import type { ASObjectNodeType } from '../as-object.schema.js';

export const PlaceSchema = {
    accuracy: 'float',
    altitude: 'float',
    latitude: 'float',
    longitude: 'float',
    radius: 'float',
    units: {
        type: 'string',
        extendSchema: (schema: StringSchema<string>) => schema.allow('inches', 'feet', 'miles', 'cm', 'm', 'km'),
    },
} satisfies SchemaObject;

export type PlaceNodeType = InferGraphEntityType<typeof PlaceSchema> & ASObjectNodeType;

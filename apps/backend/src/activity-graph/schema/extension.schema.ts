import type { SchemaObject, InferGraphEntityType } from '../../../../../../neode/lib/types/index.js';

export const ExtensionNodeLabel = 'Extension';

export const ExtensionSchema = {
    id: {
        primary: true,
        type: 'uuid',
        required: true,
    },
    name: {
        type: 'string',
        required: true,
    },
} satisfies SchemaObject;

export type ExtensionNodeType = InferGraphEntityType<typeof ExtensionSchema>;

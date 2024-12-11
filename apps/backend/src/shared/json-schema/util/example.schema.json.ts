import type { JSONSchema7 } from 'json-schema';

export default {
    $id: 'https://schema.paralo.de/test/example.schema.json',
    type: 'object',
    title: 'Example Schema',
    $schema: 'https://json-schema.org/draft-07/schema',
    properties: {
        stuff: {
            type: 'string',
        },
    },
} satisfies JSONSchema7;

import type { JSONSchema7 } from 'json-schema';

export default {
    $id: 'https://schema.bytebunker.dev/test/example.schema.json',
    $schema: 'http://json-schema.org/draft-07/schema',
    type: 'object',
    title: 'Example Schema',
    properties: {
        stuff: {
            type: 'string',
        },
    },
} satisfies JSONSchema7;

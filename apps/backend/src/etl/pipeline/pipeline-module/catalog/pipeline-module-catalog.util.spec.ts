import { describe, expect, it } from 'vitest';
import { PipelineModuleTypeEnum } from '../type/pipeline-module-type.enum.js';
import { buildModuleCatalog, describeJsonSchemaType, renderCatalogMarkdown } from './pipeline-module-catalog.util.js';

const catalog = buildModuleCatalog([
    {
        id: 'b:second@1',
        type: PipelineModuleTypeEnum.NORMAL,
        inputSchema: {
            type: 'object',
            required: ['activities'],
            properties: {
                activities: { type: 'array', items: { $ref: 'https://schema.bytebunker.dev/ActivityDto.schema.json' } },
                limit: { type: 'integer', description: 'Max count' },
                dependentModules: { type: 'array', items: { type: 'null' } },
            },
        },
        outputSchema: { type: 'object', properties: { success: { type: 'null' }, count: { type: 'integer' } } },
    },
    { id: 'a:first@1', type: PipelineModuleTypeEnum.TRIGGER, description: 'Starts things.' },
]);

describe('module catalog', () => {
    it('sorts modules, hides the special handles and describes ports', () => {
        expect(catalog.modules.map((m) => m.id)).toEqual(['a:first@1', 'b:second@1']);
        expect(catalog.modules[0].description).toBe('Starts things.');

        const second = catalog.modules[1];

        expect(second.inputs).toEqual([
            { name: 'activities', type: 'array<ActivityDto>', required: true },
            { name: 'limit', type: 'integer', required: false, description: 'Max count' },
        ]);
        expect(second.outputs).toEqual([{ name: 'count', type: 'integer', required: false }]);
    });

    it('describes enums and unions', () => {
        expect(describeJsonSchemaType({ enum: ['a', 'b'] })).toBe('"a" | "b"');
        expect(describeJsonSchemaType({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe('string | null');
        expect(describeJsonSchemaType(undefined)).toBe('any');
    });

    it('renders markdown with modules, handle rules and the example', () => {
        const markdown = renderCatalogMarkdown(catalog);

        expect(markdown).toContain('### `b:second@1` (normal)');
        expect(markdown).toContain('`activities` (array<ActivityDto>, required)');
        expect(markdown).toContain('dependentModules');
        expect(markdown).toContain('"moduleId": "bytebunker-core:store-activity@1"');
    });
});

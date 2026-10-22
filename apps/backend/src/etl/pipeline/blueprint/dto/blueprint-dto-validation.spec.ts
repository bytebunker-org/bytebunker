import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreatePipelineBlueprintDto } from './create-pipeline-blueprint.dto.js';
import { UpdatePipelineBlueprintDto } from './update-pipeline-blueprint.dto.js';

// Same options as main.ts
const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
});

const data = {
    nodes: [
        {
            id: 1,
            moduleId: 'bytebunker-core:store-activity@1',
            position: { x: 0, y: 0 },
            constantInputData: {},
        },
    ],
    edges: [],
};

const run = (metatype: new () => unknown, value: unknown) => pipe.transform(value, { type: 'body', metatype });

describe('blueprint DTO validation', () => {
    it('accepts a create payload', async () => {
        const result = (await run(CreatePipelineBlueprintDto, { title: 'T', description: 'D', data })) as {
            title: string;
            data: { nodes: unknown[] };
        };
        expect(result.title).toBe('T');
        expect(result.data.nodes).toHaveLength(1);
    });

    it('accepts create without data', async () => {
        await expect(run(CreatePipelineBlueprintDto, { title: 'T' })).resolves.toBeDefined();
    });

    it('accepts an update payload', async () => {
        await expect(run(UpdatePipelineBlueprintDto, { title: 'T', data })).resolves.toBeDefined();
    });

    it('rejects unknown properties and invalid nested data', async () => {
        await expect(run(CreatePipelineBlueprintDto, { title: 'T', foo: 1 })).rejects.toThrow();
        await expect(
            run(CreatePipelineBlueprintDto, { title: 'T', data: { nodes: [{ id: -1 }], edges: [] } }),
        ).rejects.toThrow();
    });
});

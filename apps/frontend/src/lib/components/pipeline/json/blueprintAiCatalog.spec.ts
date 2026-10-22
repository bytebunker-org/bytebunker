import { describe, expect, it } from 'vitest';
import type { PipelineModuleDto } from '@bytebunker/backend';
import { buildBlueprintAiCatalog } from './blueprintAiCatalog.js';

const modules = [
	{
		id: 'ext:transform@1',
		type: 'transform',
		inputTypeSchema: {
			jsonSchema: {
				properties: { text: { type: 'string' }, items: { type: 'array' } },
				required: ['text']
			}
		},
		outputTypeSchema: { jsonSchema: { properties: { result: { type: 'number' } } } }
	},
	{ id: 'ext:start@1', type: 'trigger' }
] as unknown as PipelineModuleDto[];

describe('buildBlueprintAiCatalog', () => {
	const text = buildBlueprintAiCatalog(modules);

	it('lists modules with typed inputs and outputs', () => {
		expect(text).toContain('- ext:transform@1 [transform]');
		expect(text).toContain('text: string (required); items: array');
		expect(text).toContain('outputs: result: number');
		expect(text).toContain('- ext:start@1 [trigger]');
	});

	it('contains a parseable example using real module ids', () => {
		const json = /```json\n([\s\S]*?)\n```/.exec(text)![1];
		const example = JSON.parse(json) as { nodes: { moduleId: string }[]; edges: unknown[] };

		expect(example.nodes.map((n) => n.moduleId)).toEqual([
			'ext:start@1',
			'ext:start@1'.replace('start', 'transform')
		]);
		expect(example.edges).toHaveLength(1);
	});
});

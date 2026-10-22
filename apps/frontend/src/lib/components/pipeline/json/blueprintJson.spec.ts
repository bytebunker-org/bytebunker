import { describe, expect, it } from 'vitest';
import { computeLayeredLayout, parseBlueprintJson, stripCodeFence } from './blueprintJson.js';

describe('stripCodeFence', () => {
	it('removes a json fence', () => {
		expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
	});

	it('takes the first fenced block out of prose', () => {
		expect(stripCodeFence('Hier:\n```\n{"a":1}\n```\nViel Erfolg')).toBe('{"a":1}');
	});

	it('leaves plain json alone', () => {
		expect(stripCodeFence('  {"a":1} ')).toBe('{"a":1}');
	});
});

describe('computeLayeredLayout', () => {
	it('places nodes in columns by longest path', () => {
		const layout = computeLayeredLayout(
			[1, 2, 3, 4],
			[
				{ source: 1, target: 2 },
				{ source: 2, target: 3 },
				{ source: 1, target: 3 },
				{ source: 1, target: 4 }
			]
		);

		expect(layout[1].x).toBe(0);
		expect(layout[2].x).toBeGreaterThan(0);
		expect(layout[3].x).toBeGreaterThan(layout[2].x);
		expect(layout[4].x).toBe(layout[2].x);
		expect(layout[4].y).not.toBe(layout[2].y);
	});

	it('terminates on cycles', () => {
		const layout = computeLayeredLayout(
			[1, 2],
			[
				{ source: 1, target: 2 },
				{ source: 2, target: 1 }
			]
		);

		expect(Object.keys(layout)).toHaveLength(2);
	});
});

describe('parseBlueprintJson', () => {
	const nodes = [
		{ id: 0, moduleId: 'a:b@1' },
		{ id: 1, moduleId: 'a:c@1', position: { x: 10.4, y: 20 }, constantInputData: { k: 1 } }
	];
	const edges = [
		{ source: 0, target: 1, sourceHandle: 'success', targetHandle: 'dependentModules' }
	];

	it('reads nodes/edges, adds positions, edge ids and constantInputData', () => {
		const result = parseBlueprintJson(JSON.stringify({ nodes, edges }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.data.nodes[0].position).toEqual({ x: 0, y: 0 });
		expect(result.value.data.nodes[0].constantInputData).toEqual({});
		expect(result.value.data.nodes[1].position).toEqual({ x: 10, y: 20 });
		expect(result.value.data.edges[0].id).toBe(0);
		expect(result.value.notes.length).toBe(2);
	});

	it('accepts a full blueprint with title and fenced code', () => {
		const text =
			'```json\n' +
			JSON.stringify({ title: 'T', description: 'D', data: { nodes, edges } }) +
			'\n```';
		const result = parseBlueprintJson(text);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.title).toBe('T');
		expect(result.value.description).toBe('D');
		expect(result.value.data.nodes).toHaveLength(2);
	});

	it('reports unusable input', () => {
		expect(parseBlueprintJson('').ok).toBe(false);
		expect(parseBlueprintJson('{nope').ok).toBe(false);
		expect(parseBlueprintJson('[]').ok).toBe(false);
		expect(parseBlueprintJson('{"edges":[]}').ok).toBe(false);
		expect(parseBlueprintJson('{"nodes":[{"moduleId":"a:b@1"}],"edges":[]}')).toMatchObject({
			ok: false,
			error: expect.stringContaining('nodes[0].id')
		});
		expect(
			parseBlueprintJson(
				'{"nodes":[],"edges":[{"source":0,"target":1,"sourceHandle":"","targetHandle":"x"}]}'
			)
		).toMatchObject({ ok: false, error: expect.stringContaining('sourceHandle') });
	});
});

import type { BlueprintDataDto } from '@bytebunker/backend';

export interface ParsedBlueprintJson {
	title?: string;
	description?: string;
	data: BlueprintDataDto;
	/** Non-fatal things that were fixed up while reading, e.g. generated positions. */
	notes: string[];
}

export type ParseBlueprintJsonResult =
	| { ok: true; value: ParsedBlueprintJson }
	| { ok: false; error: string };

const LAYER_WIDTH = 340;
const ROW_HEIGHT = 220;

/** Removes a surrounding markdown code fence (```json ... ```) as chat answers usually contain one. */
export function stripCodeFence(text: string): string {
	const trimmed = text.trim();
	const fenced = /^```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(trimmed);

	if (fenced) {
		return fenced[1].trim();
	}

	// Fence somewhere inside surrounding prose: take the first fenced block.
	const inner = /```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```/.exec(trimmed);

	return inner && !trimmed.startsWith('{') ? inner[1].trim() : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerAtLeastZero(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function hasPosition(node: Record<string, unknown>): boolean {
	const position = node['position'];

	return isRecord(position) && Number.isFinite(position['x']) && Number.isFinite(position['y']);
}

/**
 * Left-to-right layout: a node's column is the length of the longest path leading to it, rows
 * count up within a column. Cycles are tolerated (every node is placed at most once per pass).
 */
export function computeLayeredLayout(
	nodeIds: number[],
	edges: { source: number; target: number }[]
): Record<number, { x: number; y: number }> {
	const known = new Set(nodeIds);
	const usable = edges.filter(
		(e) => known.has(e.source) && known.has(e.target) && e.source !== e.target
	);
	const layer = new Map<number, number>(nodeIds.map((id) => [id, 0]));

	// Bellman-Ford style relaxation, bounded so cycles terminate.
	for (let pass = 0; pass < nodeIds.length; pass++) {
		let changed = false;

		for (const edge of usable) {
			const candidate = (layer.get(edge.source) ?? 0) + 1;

			if (candidate > (layer.get(edge.target) ?? 0) && candidate < nodeIds.length) {
				layer.set(edge.target, candidate);
				changed = true;
			}
		}

		if (!changed) {
			break;
		}
	}

	const rows = new Map<number, number>();
	const positions: Record<number, { x: number; y: number }> = {};

	for (const id of nodeIds) {
		const nodeLayer = layer.get(id) ?? 0;
		const row = rows.get(nodeLayer) ?? 0;

		rows.set(nodeLayer, row + 1);
		positions[id] = { x: nodeLayer * LAYER_WIDTH, y: row * ROW_HEIGHT };
	}

	return positions;
}

/**
 * Reads pasted text (plain JSON, a markdown code block, `{nodes, edges}`, `{data: {nodes, edges}}`
 * or a whole exported blueprint) into blueprint data. Only fixes what can be fixed without guessing;
 * semantic problems are left to the backend validation.
 */
function parseBlueprintJsonUnsafe(text: string): ParseBlueprintJsonResult {
	const source = stripCodeFence(text);

	if (!source) {
		return { ok: false, error: 'Kein JSON eingegeben.' };
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(source);
	} catch (error) {
		return { ok: false, error: `Kein gültiges JSON: ${(error as Error).message}` };
	}

	if (!isRecord(parsed)) {
		return { ok: false, error: 'Das JSON muss ein Objekt mit "nodes" und "edges" sein.' };
	}

	const wrapper = parsed;
	const body = isRecord(wrapper['data']) ? wrapper['data'] : wrapper;
	const notes: string[] = [];

	if (!Array.isArray(body['nodes'])) {
		return { ok: false, error: 'Es fehlt "nodes" (Array von Nodes).' };
	}

	let edgesInput = body['edges'];

	if (edgesInput === undefined) {
		edgesInput = [];
		notes.push('"edges" fehlte und wurde als leer angenommen.');
	}

	if (!Array.isArray(edgesInput)) {
		return { ok: false, error: '"edges" muss ein Array sein.' };
	}

	const nodeInputs = body['nodes'] as unknown[];

	for (const [index, node] of nodeInputs.entries()) {
		if (!isRecord(node)) {
			return { ok: false, error: `nodes[${index}] ist kein Objekt.` };
		}

		if (!isIntegerAtLeastZero(node['id'])) {
			return { ok: false, error: `nodes[${index}].id muss eine ganze Zahl >= 0 sein.` };
		}

		if (typeof node['moduleId'] !== 'string' || !node['moduleId']) {
			return { ok: false, error: `nodes[${index}].moduleId fehlt (z. B. "extension:modul@1").` };
		}

		if (node['constantInputData'] !== undefined && !isRecord(node['constantInputData'])) {
			return { ok: false, error: `nodes[${index}].constantInputData muss ein Objekt sein.` };
		}
	}

	const usedEdgeIds = new Set(
		(edgesInput as unknown[]).flatMap((e) =>
			isRecord(e) && isIntegerAtLeastZero(e['id']) ? [e['id']] : []
		)
	);
	let nextEdgeId = 0;
	let generatedEdgeIds = 0;

	const edges = (edgesInput as unknown[]).map((edge, index) => {
		if (!isRecord(edge)) {
			throw new Error(`edges[${index}] ist kein Objekt.`);
		}

		for (const key of ['source', 'target'] as const) {
			if (!isIntegerAtLeastZero(edge[key])) {
				throw new Error(`edges[${index}].${key} muss eine Node-ID (ganze Zahl) sein.`);
			}
		}

		for (const key of ['sourceHandle', 'targetHandle'] as const) {
			if (typeof edge[key] !== 'string' || !edge[key]) {
				throw new Error(`edges[${index}].${key} fehlt.`);
			}
		}

		let id = edge['id'];

		if (id === undefined) {
			while (usedEdgeIds.has(nextEdgeId)) {
				nextEdgeId++;
			}

			id = nextEdgeId++;
			generatedEdgeIds++;
		} else if (!isIntegerAtLeastZero(id)) {
			throw new Error(`edges[${index}].id muss eine ganze Zahl >= 0 sein.`);
		}

		return { ...edge, id } as unknown as BlueprintDataDto['edges'][number];
	});

	if (generatedEdgeIds) {
		notes.push(`${generatedEdgeIds} Edge-ID(s) wurden ergänzt.`);
	}

	const missingPosition = nodeInputs
		.map((n) => n as Record<string, unknown>)
		.filter((n) => !hasPosition(n));
	const layout = missingPosition.length
		? computeLayeredLayout(
				nodeInputs.map((n) => (n as Record<string, unknown>)['id'] as number),
				edges
			)
		: {};

	if (missingPosition.length) {
		notes.push(`${missingPosition.length} Node-Position(en) wurden automatisch berechnet.`);
	}

	const nodes = nodeInputs.map((raw) => {
		const node = raw as Record<string, unknown>;
		const id = node['id'] as number;
		const position = hasPosition(node)
			? (node['position'] as { x: number; y: number })
			: layout[id];

		return {
			...node,
			constantInputData: node['constantInputData'] ?? {},
			position: { x: Math.round(Number(position.x)), y: Math.round(Number(position.y)) }
		} as unknown as BlueprintDataDto['nodes'][number];
	});

	return {
		ok: true,
		value: {
			title: typeof wrapper['title'] === 'string' ? wrapper['title'] : undefined,
			description: typeof wrapper['description'] === 'string' ? wrapper['description'] : undefined,
			data: { nodes, edges },
			notes
		}
	};
}

export function parseBlueprintJson(text: string): ParseBlueprintJsonResult {
	try {
		return parseBlueprintJsonUnsafe(text);
	} catch (error) {
		// The edge checks throw to keep the happy path flat.
		return { ok: false, error: (error as Error).message };
	}
}

export function formatBlueprintJson(data: BlueprintDataDto): string {
	return JSON.stringify({ nodes: data.nodes, edges: data.edges }, null, 2);
}

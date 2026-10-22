import type { PipelineModuleDto } from '@bytebunker/backend';
import type { JSONSchema7 } from 'json-schema';

function describeProperties(schema: JSONSchema7 | undefined, markRequired: boolean): string[] {
	const required = new Set(schema?.required ?? []);

	return Object.entries(schema?.properties ?? {}).map(([name, property]) => {
		const definition = typeof property === 'object' ? property : {};
		const type = Array.isArray(definition.type)
			? definition.type.join('|')
			: (definition.type ?? 'any');
		const description = definition.description
			? ` - ${definition.description.replace(/\s+/g, ' ')}`
			: '';

		return `${name}: ${type}${markRequired && required.has(name) ? ' (required)' : ''}${description}`;
	});
}

function describeModule(module: PipelineModuleDto): string {
	const inputs = describeProperties(
		module.inputTypeSchema?.jsonSchema as JSONSchema7 | undefined,
		true
	);
	const outputs = describeProperties(
		module.outputTypeSchema?.jsonSchema as JSONSchema7 | undefined,
		false
	);

	return [
		`- ${module.id} [${module.type}]`,
		`    inputs: ${inputs.length ? inputs.join('; ') : '(none)'}`,
		`    outputs: ${outputs.length ? outputs.join('; ') : '(none)'}`
	].join('\n');
}

/**
 * Compact text for pasting into an AI chat so it can generate blueprints: the available modules
 * with their typed inputs/outputs, the JSON shape, the connection rules and a small example.
 */
export function buildBlueprintAiCatalog(modules: PipelineModuleDto[]): string {
	const sorted = [...modules].sort((a, b) => a.id.localeCompare(b.id));
	const trigger = sorted.find((m) => m.type === 'trigger');
	const other = sorted.find((m) => m !== trigger);

	const example = {
		nodes: [
			...(trigger ? [{ id: 0, moduleId: trigger.id, constantInputData: {} }] : []),
			...(other ? [{ id: trigger ? 1 : 0, moduleId: other.id, constantInputData: {} }] : [])
		],
		edges:
			trigger && other
				? [
						{
							id: 0,
							source: 0,
							sourceHandle: 'success',
							target: 1,
							targetHandle: 'dependentModules'
						}
					]
				: []
	};

	return `# bytebunker blueprint format

A blueprint is a pipeline graph. Nodes are module instances, edges connect an output of one node to an input of another.
Reply with a single JSON object (code block) of the shape { "nodes": [...], "edges": [...] }. Positions are optional (they are laid out automatically).

## Shape
node: { "id": int >= 0 (unique), "moduleId": "<extension>:<module>@<version>", "constantInputData": { <input name>: <value> }, "position"?: { "x": int, "y": int } }
edge: { "id": int >= 0 (unique), "source": <node id>, "sourceHandle": <output name>, "target": <node id>, "targetHandle": <input name> }

## Rules
- Every required input of a node must be set in constantInputData or be the target of an edge.
- An edge fits when the output type equals the input type, or when the input type is array (several edges merge into the array).
- Every module also has the control handles "success" (output) and "dependentModules" (input). Connect success -> dependentModules to run a node after another one without passing data.
- The graph must not contain cycles or edges from a node to itself. Node and edge ids must be unique.
- execute-code nodes may declare extra handles with constantInputData.customInputParameters / customOutputParameters (string arrays); those handles are untyped.
- Blueprints normally start with a trigger module.

## Modules (${sorted.length})
${sorted.map(describeModule).join('\n')}

## Example
\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`
`;
}

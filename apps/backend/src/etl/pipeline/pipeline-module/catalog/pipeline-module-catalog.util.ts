import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';
import { PipelineModuleTypeEnum } from '../type/pipeline-module-type.enum.js';

export interface CatalogPort {
    name: string;
    /** JSON type, e.g. `string`, `integer`, `array<ActivityDto>`. */
    type: string;
    required: boolean;
    description?: string;
}

export interface CatalogModule {
    id: string;
    type: PipelineModuleTypeEnum;
    description?: string;
    inputs: CatalogPort[];
    outputs: CatalogPort[];
}

export interface ModuleCatalog {
    blueprintFormat: typeof BLUEPRINT_FORMAT;
    exampleBlueprint: typeof EXAMPLE_BLUEPRINT;
    modules: CatalogModule[];
}

export interface CatalogModuleSource {
    id: string;
    type: PipelineModuleTypeEnum;
    description?: string;
    inputSchema?: JSONSchema7;
    outputSchema?: JSONSchema7;
}

/** Added to every module's schema by the registry; documented once in the format instead of per module. */
const SPECIAL_HANDLES = new Set(['dependentModules', 'success']);

export const BLUEPRINT_FORMAT = {
    summary:
        'A blueprint is a directed acyclic graph of module nodes. Data flows along edges from an output of the ' +
        'source node to an input of the target node. A blueprint usually starts with one trigger node.',
    blueprint: {
        title: 'string, required',
        description: 'string, optional',
        data: '{ nodes: Node[], edges: Edge[] }',
    },
    node: {
        id: 'integer >= 0, unique in the blueprint',
        moduleId: 'module id from the catalog, e.g. "bytebunker-core:store-activity@1"',
        position: '{ x: integer, y: integer } canvas position; lay nodes out left to right, ~300 px apart',
        constantInputData:
            'optional object: fixed values for inputs that are not connected by an edge (required inputs must come from either)',
        parentId: 'optional node id, only for grouping in the editor',
    },
    edge: {
        id: 'integer >= 0, unique among edges',
        source: 'id of the node the data comes from',
        target: 'id of the node the data goes to',
        sourceHandle: 'name of an output of the source module',
        targetHandle: 'name of an input of the target module',
    },
    handles: [
        'Handle names are the output/input names listed per module; the types must match (an array input accepts a single value of its item type, several edges into one array input are merged).',
        'Every module also has the special output "success" and the special input "dependentModules". Connect success -> dependentModules to run a node after another one without passing data.',
        'A node runs once all nodes feeding it have finished. Cycles are not allowed.',
        'Validate a draft with POST /pipelines-blueprints/validate before saving it.',
    ],
};

export const EXAMPLE_BLUEPRINT = {
    title: 'YouTube watch history import',
    description: 'Imports watch-history.html from a Google Takeout export.',
    data: {
        nodes: [
            {
                id: 1,
                moduleId: 'common-pipeline-triggers:local-file-trigger@1',
                position: { x: 0, y: 0 },
                constantInputData: { globPatterns: ['youtube/**/watch-history.html'] },
            },
            {
                id: 2,
                moduleId: 'youtube:transform-you-tube-watch-history@1',
                position: { x: 300, y: 0 },
                constantInputData: {},
            },
            {
                id: 3,
                moduleId: 'bytebunker-core:store-activity@1',
                position: { x: 600, y: 0 },
                constantInputData: {},
            },
        ],
        edges: [
            { id: 0, source: 1, target: 2, sourceHandle: 'fileAsset', targetHandle: 'rawHtml' },
            { id: 1, source: 2, target: 3, sourceHandle: 'activities', targetHandle: 'activities' },
        ],
    },
};

export function describeJsonSchemaType(schema: JSONSchema7Definition | undefined): string {
    if (!schema || typeof schema !== 'object') {
        return 'any';
    }

    if (schema.$ref) {
        return (
            schema.$ref
                .split('/')
                .pop()
                ?.replace(/\.schema\.json$/, '') || 'object'
        );
    }

    if (schema.type === 'array') {
        return `array<${Array.isArray(schema.items) ? 'mixed' : describeJsonSchemaType(schema.items)}>`;
    }

    if (schema.enum) {
        return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
    }

    const union = schema.anyOf ?? schema.oneOf;
    if (union) {
        return union.map((member) => describeJsonSchemaType(member)).join(' | ');
    }

    if (Array.isArray(schema.type)) {
        return schema.type.join(' | ');
    }

    if (schema.type === 'object' && schema.title) {
        return schema.title;
    }

    return schema.type ?? 'any';
}

function portsOf(schema: JSONSchema7 | undefined): CatalogPort[] {
    const required = new Set(schema?.required ?? []);

    return Object.entries(schema?.properties ?? {})
        .filter(([name]) => !SPECIAL_HANDLES.has(name))
        .map(([name, property]) => ({
            name,
            type: describeJsonSchemaType(property),
            required: required.has(name),
            ...(typeof property === 'object' && property.description ? { description: property.description } : {}),
        }));
}

export function buildModuleCatalog(sources: CatalogModuleSource[]): ModuleCatalog {
    return {
        blueprintFormat: BLUEPRINT_FORMAT,
        exampleBlueprint: EXAMPLE_BLUEPRINT,
        modules: [...sources]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((source) => ({
                id: source.id,
                type: source.type,
                ...(source.description ? { description: source.description } : {}),
                inputs: portsOf(source.inputSchema),
                outputs: portsOf(source.outputSchema),
            })),
    };
}

function renderPorts(ports: CatalogPort[]): string {
    if (!ports.length) {
        return '  - (none)';
    }

    return ports
        .map(
            (port) =>
                `  - \`${port.name}\` (${port.type}${port.required ? ', required' : ''})${port.description ? `: ${port.description}` : ''}`,
        )
        .join('\n');
}

export function renderCatalogMarkdown(catalog: ModuleCatalog): string {
    const format = catalog.blueprintFormat;
    const fields = (fields: Record<string, string>) =>
        Object.entries(fields)
            .map(([name, text]) => `- \`${name}\`: ${text}`)
            .join('\n');

    return [
        '# bytebunker blueprint reference',
        '',
        format.summary,
        '',
        '## Blueprint JSON',
        '',
        fields(format.blueprint),
        '',
        '### Node',
        '',
        fields(format.node),
        '',
        '### Edge',
        '',
        fields(format.edge),
        '',
        '### Handles',
        '',
        format.handles.map((line) => `- ${line}`).join('\n'),
        '',
        '## Modules',
        '',
        ...catalog.modules.flatMap((module) => [
            `### \`${module.id}\` (${module.type})`,
            '',
            ...(module.description ? [module.description, ''] : []),
            'Inputs:',
            renderPorts(module.inputs),
            '',
            'Outputs:',
            renderPorts(module.outputs),
            '',
        ]),
        '## Example',
        '',
        '```json',
        JSON.stringify(catalog.exampleBlueprint, null, 2),
        '```',
        '',
    ].join('\n');
}

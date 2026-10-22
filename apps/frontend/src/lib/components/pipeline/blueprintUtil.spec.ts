import type { PipelineModuleDto, Blueprint } from '@bytebunker/backend';

interface BlueprintMockNode {
	moduleId: string;
	constantInputData?: Record<string, unknown>;
}

export class BlueprintMock {
	constructor(private readonly nodes: Record<number, BlueprintMockNode>) {}

	getNode(id: number): BlueprintMockNode | undefined {
		return this.nodes[id];
	}
}

export function createTestBlueprint() {
	return new BlueprintMock({
		1: { moduleId: 'some-extension:my-module@1' },
		2: { moduleId: 'some-extension:my-module@2' },
		3: { moduleId: 'some-extension:my-module@3' }
	}) as unknown as Blueprint;
}

export function createTestPipelineModules(): Record<string, PipelineModuleDto> {
	return {
		'some-extension:my-module@1': {
			outputTypeSchema: {
				jsonSchema: {
					properties: {
						outString: { type: 'string' },
						outNumber: { type: 'number' }
					}
				}
			}
		} as unknown as PipelineModuleDto,
		'some-extension:my-module@2': {
			inputTypeSchema: {
				jsonSchema: {
					properties: {
						inString: { type: 'string' },
						inNumber: { type: 'number' }
					}
				}
			}
		} as unknown as PipelineModuleDto,
		'some-extension:my-module@3': {
			inputTypeSchema: {
				jsonSchema: {
					properties: {
						inArray: { type: 'array' }
					}
				}
			}
		} as unknown as PipelineModuleDto
	};
}

import { describe, it, expect } from 'vitest';
import {
	areSchemaTypesCompatible,
	isValidConnection
} from '$lib/components/pipeline/blueprintUtil.js';
import type { Connection } from '@xyflow/svelte';

describe('isValidConnection', () => {
	const blueprint = createTestBlueprint();
	const pipelineModules = createTestPipelineModules();

	it('returns false if source === target', () => {
		const edge: Connection = {
			source: '1',
			target: '1',
			sourceHandle: 'outString',
			targetHandle: 'inString'
		};
		const result = isValidConnection(blueprint, pipelineModules, edge);
		expect(result).toBe(false);
	});

	it('returns false if any handle is missing', () => {
		// Missing sourceHandle
		const edgeNoSourceHandle: Connection = {
			source: '1',
			target: '2',
			sourceHandle: null,
			targetHandle: null
		};
		expect(isValidConnection(blueprint, pipelineModules, edgeNoSourceHandle)).toBe(false);

		// Missing targetHandle
		const edgeNoTargetHandle: Connection = {
			source: '1',
			target: '2',
			sourceHandle: 'outString',
			targetHandle: null
		};
		expect(isValidConnection(blueprint, pipelineModules, edgeNoTargetHandle)).toBe(false);
	});

	it('handles special handles correctly', () => {
		// We'll assume your code has: specialHandleNames = ['dependentModules', 'success']
		// and allowedSpecialHandleConnections = { success: 'dependentModules' }

		const edgeValid: Connection = {
			source: '1',
			target: '2',
			sourceHandle: 'success', // special handle
			targetHandle: 'dependentModules' // allowedSpecialHandleConnections[sourceHandle] = 'dependentModules'
		};
		expect(isValidConnection(blueprint, pipelineModules, edgeValid)).toBe(true);

		const edgeInvalid: Connection = {
			source: '1',
			target: '2',
			sourceHandle: 'success',
			targetHandle: 'inString' // NOT the allowed "dependentModules"
		};
		expect(isValidConnection(blueprint, pipelineModules, edgeInvalid)).toBe(false);
	});

	it('returns false if source node or target node is not found', () => {
		const edgeWithInvalidSource: Connection = {
			source: '999', // node doesn't exist
			target: '2',
			sourceHandle: 'outString',
			targetHandle: 'inString'
		};
		expect(isValidConnection(blueprint, pipelineModules, edgeWithInvalidSource)).toBe(false);

		const edgeWithInvalidTarget: Connection = {
			source: '1',
			target: '999', // node doesn't exist
			sourceHandle: 'outString',
			targetHandle: 'inString'
		};
		expect(isValidConnection(blueprint, pipelineModules, edgeWithInvalidTarget)).toBe(false);
	});

	it('returns false if source/target modules are not found', () => {
		// If node references a module that doesn't exist in pipelineModules
		const blueprintWithInvalidModule = createTestBlueprint();
		blueprintWithInvalidModule['nodes'][1].moduleId = 'unknown-module@1'; // override for test

		const edge: Connection = {
			source: '1',
			target: '2',
			sourceHandle: 'outString',
			targetHandle: 'inString'
		};
		expect(isValidConnection(blueprintWithInvalidModule, pipelineModules, edge)).toBe(false);
	});

	it('checks matching property schema types', () => {
		// sourcePropertySchema.type === targetPropertySchema.type
		const edgeSameType: Connection = {
			source: '1', // outString -> type string
			target: '2', // inString -> type string
			sourceHandle: 'outString',
			targetHandle: 'inString'
		};
		expect(isValidConnection(blueprint, pipelineModules, edgeSameType)).toBe(true);

		// If target property is array, it's allowed
		const edgeTargetArray: Connection = {
			source: '1', // outString -> type string
			target: '3', // inArray -> type array
			sourceHandle: 'outString',
			targetHandle: 'inArray'
		};
		expect(isValidConnection(blueprint, pipelineModules, edgeTargetArray)).toBe(true);

		// source = number, target = string => not allowed
		const edgeMismatch: Connection = {
			source: '1', // outNumber -> number
			target: '2', // inString -> string
			sourceHandle: 'outNumber',
			targetHandle: 'inString'
		};
		expect(isValidConnection(blueprint, pipelineModules, edgeMismatch)).toBe(false);
	});

	it('returns false if a handle does not exist on a module with a schema', () => {
		expect(
			isValidConnection(blueprint, pipelineModules, {
				source: '1',
				target: '2',
				sourceHandle: 'notInSchema',
				targetHandle: 'inString'
			})
		).toBe(false);
		expect(
			isValidConnection(blueprint, pipelineModules, {
				source: '1',
				target: '2',
				sourceHandle: 'outString',
				targetHandle: 'alsoNotInSchema'
			})
		).toBe(false);
	});

	it('accepts any handle on modules without a schema', () => {
		const modules = {
			...pipelineModules,
			'some-extension:my-module@1': {} as unknown as PipelineModuleDto
		};

		expect(
			isValidConnection(blueprint, modules, {
				source: '1',
				target: '2',
				sourceHandle: 'anything',
				targetHandle: 'inString'
			})
		).toBe(true);
	});

	it('treats custom execute-code handles as untyped', () => {
		const customBlueprint = new BlueprintMock({
			1: {
				moduleId: 'some-extension:my-module@1',
				constantInputData: { customOutputParameters: ['dynamicOut'] }
			},
			2: {
				moduleId: 'some-extension:my-module@2',
				constantInputData: { customInputParameters: ['dynamicIn'] }
			}
		}) as unknown as Blueprint;

		// custom output -> typed input
		expect(
			isValidConnection(customBlueprint, pipelineModules, {
				source: '1',
				target: '2',
				sourceHandle: 'dynamicOut',
				targetHandle: 'inNumber'
			})
		).toBe(true);
		// typed output -> custom input
		expect(
			isValidConnection(customBlueprint, pipelineModules, {
				source: '1',
				target: '2',
				sourceHandle: 'outNumber',
				targetHandle: 'dynamicIn'
			})
		).toBe(true);
		// undeclared handle is still invalid
		expect(
			isValidConnection(customBlueprint, pipelineModules, {
				source: '1',
				target: '2',
				sourceHandle: 'undeclared',
				targetHandle: 'inNumber'
			})
		).toBe(false);
	});

	it('does not allow the special handles to be mixed with typed handles', () => {
		expect(
			isValidConnection(blueprint, pipelineModules, {
				source: '1',
				target: '2',
				sourceHandle: 'outString',
				targetHandle: 'dependentModules'
			})
		).toBe(false);
		expect(
			isValidConnection(blueprint, pipelineModules, {
				source: '1',
				target: '2',
				sourceHandle: 'dependentModules',
				targetHandle: 'success'
			})
		).toBe(false);
	});
});

describe('areSchemaTypesCompatible', () => {
	it('accepts equal, untyped and array targets', () => {
		expect(areSchemaTypesCompatible({ type: 'string' }, { type: 'string' })).toBe(true);
		expect(areSchemaTypesCompatible({}, { type: 'string' })).toBe(true);
		expect(areSchemaTypesCompatible({ type: 'string' }, {})).toBe(true);
		expect(areSchemaTypesCompatible({ type: 'number' }, { type: 'array' })).toBe(true);
		expect(areSchemaTypesCompatible({ type: 'array' }, { type: 'string' })).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import type { BlueprintDataDto, BlueprintValidationIssueDto } from '@bytebunker/backend';
import {
	countIssues,
	groupIssuesByNode,
	issueNodeIds,
	validationDataKey
} from './blueprintValidation.js';

const data = {
	nodes: [],
	edges: [{ id: 5, source: 1, target: 2, sourceHandle: 'a', targetHandle: 'b' }]
} as unknown as BlueprintDataDto;

const issues: BlueprintValidationIssueDto[] = [
	{ severity: 'error', code: 'missing-input', message: 'x', nodeId: 3 },
	{ severity: 'error', code: 'type-mismatch', message: 'y', edgeId: 5 },
	{ severity: 'warning', code: 'no-trigger', message: 'z' }
];

describe('blueprintValidation', () => {
	it('counts by severity', () => {
		expect(countIssues(issues)).toEqual({ errors: 2, warnings: 1 });
	});

	it('resolves node ids of node and edge issues', () => {
		expect(issueNodeIds(issues[0], data)).toEqual([3]);
		expect(issueNodeIds(issues[1], data)).toEqual([1, 2]);
		expect(issueNodeIds(issues[2], data)).toEqual([]);
	});

	it('groups issues by node', () => {
		const grouped = groupIssuesByNode(issues, data);

		expect(Object.keys(grouped).sort()).toEqual(['1', '2', '3']);
		expect(grouped[1]).toEqual([issues[1]]);
	});

	it('ignores positions in the data key', () => {
		const a = { nodes: [{ id: 1, moduleId: 'm', position: { x: 1, y: 2 } }], edges: [] };
		const b = { nodes: [{ id: 1, moduleId: 'm', position: { x: 9, y: 9 } }], edges: [] };

		expect(validationDataKey(a as unknown as BlueprintDataDto)).toBe(
			validationDataKey(b as unknown as BlueprintDataDto)
		);
	});
});

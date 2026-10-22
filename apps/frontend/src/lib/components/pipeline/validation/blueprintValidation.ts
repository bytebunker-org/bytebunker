import type { BlueprintDataDto, BlueprintValidationIssueDto } from '@bytebunker/backend';

export function countIssues(issues: BlueprintValidationIssueDto[]): {
	errors: number;
	warnings: number;
} {
	return {
		errors: issues.filter((i) => i.severity === 'error').length,
		warnings: issues.filter((i) => i.severity === 'warning').length
	};
}

/** Node ids an issue refers to; edge issues refer to both end nodes of the edge. */
export function issueNodeIds(
	issue: BlueprintValidationIssueDto,
	data?: Pick<BlueprintDataDto, 'edges'>
): number[] {
	if (issue.nodeId !== undefined) {
		return [issue.nodeId];
	}

	if (issue.edgeId !== undefined) {
		const edge = data?.edges?.find((e) => e.id === issue.edgeId);

		return edge ? [...new Set([edge.source, edge.target])] : [];
	}

	return [];
}

/**
 * Issues per node, shown on the nodes. Edge issues are attributed to the edge's nodes as long as
 * the backend did not name a node itself.
 */
export function groupIssuesByNode(
	issues: BlueprintValidationIssueDto[],
	data?: Pick<BlueprintDataDto, 'edges'>
): Record<number, BlueprintValidationIssueDto[]> {
	const grouped: Record<number, BlueprintValidationIssueDto[]> = {};

	for (const issue of issues) {
		for (const nodeId of issueNodeIds(issue, data)) {
			(grouped[nodeId] ??= []).push(issue);
		}
	}

	return grouped;
}

/** Stable key for "did anything relevant to validation change" (node positions are ignored). */
export function validationDataKey(data: BlueprintDataDto): string {
	return JSON.stringify({
		nodes: data.nodes.map((n) => ({ ...n, position: undefined })),
		edges: data.edges.map((e) => ({ ...e, id: undefined }))
	});
}

/** Issues that make the blueprint impossible to show in the editor. */
export const editorBlockingIssueCodes = ['unknown-module', 'duplicate-node-id'];

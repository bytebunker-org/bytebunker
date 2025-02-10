import type { PipelineModuleIdentifier } from '@bytebunker/backend';
import type { Component } from 'svelte';
import LucideFolderInput from '~icons/lucide/folder-input';
import LucideBlocks from '~icons/lucide/blocks';
import LucideSquareX from '~icons/lucide/square-x';
import {
	type MaterialColorName,
	type MaterialColorShade
} from '$lib/util/materialColor/materialColors.js';
import { deconstructPipelineModuleIdentifier } from '@bytebunker/backend';
import {
	getMaterialColorDetails,
	hashTextToMaterialStyleColor,
	isLightColor
} from '$lib/util/materialColor/colorUtil.js';

export interface PipelineModuleNodeInfo {
	icon: Component;

	backgroundColor: string;

	color: string;

	foreground: 'light' | 'dark';
}

/**
 * Options for how to display a blueprint node. The key can be a whole module identifier or missing the version part.
 */
export const pipelineModuleNodeRegistry = new Map<
	PipelineModuleIdentifier | string,
	PipelineModuleNodeInfo
>();

function registerPipelineModuleNode(
	identifier: PipelineModuleIdentifier | string,
	options: Partial<PipelineModuleNodeInfo> & {
		materialColor?: MaterialColorName;
		materialColorShade?: MaterialColorShade;
	} = {}
): PipelineModuleNodeInfo {
	const { extensionName, moduleName, moduleVersion } = deconstructPipelineModuleIdentifier(
		identifier as PipelineModuleIdentifier,
		true
	);

	const materialColor = options.materialColor
		? getMaterialColorDetails(options.materialColor, options.materialColorShade ?? 500)
		: hashTextToMaterialStyleColor(moduleName, 500);

	let foreground: 'light' | 'dark';

	if (options.color) {
		foreground = isLightColor(options.color) ? 'light' : 'dark';
	} else if (options.backgroundColor) {
		foreground = isLightColor(options.backgroundColor) ? 'dark' : 'light';
	} else {
		foreground = materialColor.foreground;
	}

	const info: PipelineModuleNodeInfo = {
		icon: options.icon ?? LucideBlocks,
		backgroundColor: options.backgroundColor ?? materialColor.backgroundColor,
		color: options.color ?? materialColor.color,
		foreground: foreground
	};

	pipelineModuleNodeRegistry.set(`${extensionName}:${moduleName}`, info);
	pipelineModuleNodeRegistry.set(`${extensionName}:${moduleName}@${moduleVersion}`, info);

	return info;
}

export function getPipelineModuleNodeInfo(identifier: PipelineModuleIdentifier | string) {
	const { extensionName, moduleName, moduleVersion } = deconstructPipelineModuleIdentifier(
		identifier as PipelineModuleIdentifier,
		true
	);

	let nodeInfo: PipelineModuleNodeInfo | undefined;

	if (identifier.includes('@')) {
		nodeInfo =
			pipelineModuleNodeRegistry.get(`${extensionName}:${moduleName}@${moduleVersion}`) ??
			pipelineModuleNodeRegistry.get(`${extensionName}:${moduleName}`)!;
	} else {
		nodeInfo =
			pipelineModuleNodeRegistry.get(`${extensionName}:${moduleName}`) ??
			pipelineModuleNodeRegistry.get(`${extensionName}:${moduleName}@${moduleVersion}`)!;
	}

	return nodeInfo ?? registerPipelineModuleNode(`${extensionName}:${moduleName}`);
}

registerPipelineModuleNode('common-pipeline-triggers:local-file-trigger@1', {
	icon: LucideFolderInput,
	materialColor: 'Green'
});

registerPipelineModuleNode('bytebunker-core:abort-execution@1', {
	icon: LucideSquareX,
	materialColor: 'Red',
	materialColorShade: 900
});

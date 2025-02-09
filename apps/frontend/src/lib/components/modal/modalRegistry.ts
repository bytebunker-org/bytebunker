import type { BlueprintNodeDto, PipelineModuleDto } from '@bytebunker/backend';
import type { Component } from 'svelte';
import EditBlueprintNodeModal from '$lib/components/modal/EditBlueprintNodeModal.svelte';
import { ModalTypeEnum } from '$lib/components/modal/modalTypeEnum.js';

interface ModalRegistryOptions {
	component: Component<ModalProps<ModalTypeEnum>>;

	size: 'sm' | 'md' | 'lg';
}

export const modalRegistry = {
	[ModalTypeEnum.EDIT_BLUEPRINT_NODE]: {
		component: EditBlueprintNodeModal,
		size: 'lg'
	}
} satisfies Record<ModalTypeEnum, ModalRegistryOptions>;

export type ModalOptionsType<T extends ModalTypeEnum> = T extends ModalTypeEnum.EDIT_BLUEPRINT_NODE
	? EditBlueprintNodeOptions
	: never;

export type ModalReturnType<T extends ModalTypeEnum> =
	ModalOptionsType<T>['returnType'] extends undefined ? void : ModalOptionsType<T>['returnType'];

export interface ModalProps<T extends ModalTypeEnum> {
	options: ModalOptionsType<T>;

	close: (result?: ModalReturnType<T>) => void;
}

export interface EditBlueprintNodeOptions {
	blueprintNode: BlueprintNodeDto;

	pipelineModule: PipelineModuleDto;

	returnType: BlueprintNodeDto;
}

export interface ModalContext {
	open<T extends ModalTypeEnum>(
		type: T,
		options?: Omit<ModalOptionsType<T>, 'returnType'>
	): Promise<ModalReturnType<T> | undefined>;
}

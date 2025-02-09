import type { BlueprintNodeDto } from '@bytebunker/backend';
import type { Component } from 'svelte';
import EditBlueprintNodeModal from '$lib/components/modal/EditBlueprintNodeModal.svelte';
import { ModalTypeEnum } from '$lib/components/modal/modalTypeEnum.js';

interface ModalRegistryOptions {
	component: Component<ModalProps<ModalTypeEnum>>;
}

export const modalRegistry = {
	[ModalTypeEnum.EDIT_BLUEPRINT_NODE]: {
		component: EditBlueprintNodeModal
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

	returnType: BlueprintNodeDto;
}

export interface ModalContext {
	open<T extends ModalTypeEnum>(
		type: T,
		options?: ModalOptionsType<T>
	): Promise<ModalReturnType<T> | undefined>;
}

<script lang="ts">
	import { Dialog, Label, Separator } from 'bits-ui';
	import { Button } from '@bytebunker/daisyui-components';
	import { fade } from 'svelte/transition';
	import { flyAndScale } from '$lib/util/flyAndScaleTransition.js';
	import { setModalContext } from '$lib/context.js';
	import {
		type ModalOptionsType,
		modalRegistry,
		type ModalReturnType
	} from '$lib/components/modal/modalRegistry.js';
	import LucideX from '~icons/lucide/x';
	import type { ModalTypeEnum } from '$lib/components/modal/modalTypeEnum.js';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let isOpen = $state(false);
	let currentType: ModalTypeEnum | undefined = $state();
	let currentOptions: ModalOptionsType<ModalTypeEnum> | undefined = $state();
	let currentCloseCallback: ((value?: ModalReturnType<ModalTypeEnum>) => void) | undefined =
		$state();

	let modalTypeInfo = $derived(currentType ? modalRegistry[currentType] : undefined);
	let ModalComponent = $derived(modalTypeInfo?.component);

	function open<T extends ModalTypeEnum>(
		type: T,
		options?: ModalOptionsType<T>
	): Promise<ModalReturnType<T> | undefined> {
		currentType = type;
		currentOptions = options;
		isOpen = true;

		console.log('opening', type);

		return new Promise((resolve) => {
			currentCloseCallback = ((value?: ModalReturnType<T>) => {
				isOpen = false;
				currentType = undefined;
				currentOptions = undefined;
				currentCloseCallback = undefined;

				resolve(value);
			}) as (value?: ModalReturnType<ModalTypeEnum>) => void;
		});
	}

	function onOpenChange(open: boolean) {
		if (!open && currentCloseCallback) {
			currentCloseCallback();
		}
	}

	setModalContext({
		open
	});
</script>

{@render children()}

<Dialog.Root bind:open={isOpen} {onOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay
			transition={fade}
			transitionConfig={{ duration: 100 }}
			class="fixed inset-0 z-50 bg-black/20"
		/>
		<Dialog.Content
			transition={flyAndScale}
			class={[
				'rounded-box bg-base-100 fixed top-[50%] left-[50%] z-50 translate-x-[-50%] translate-y-[-50%] border border-neutral-300 drop-shadow-2xl outline-none',
				{
					'w-full max-w-[94%] sm:max-w-[490px]': modalTypeInfo?.size === 'sm',
					'w-full max-w-[94%] md:max-w-sm': modalTypeInfo?.size === 'md' || !modalTypeInfo?.size,
					'w-full max-w-[94%] md:max-w-[90%] lg:max-w-[80%] xl:max-w-[60%]':
						modalTypeInfo?.size === 'lg'
				}
			]}
		>
			{#if modalTypeInfo && ModalComponent && currentOptions && currentCloseCallback}
				<svelte:boundary>
					<ModalComponent options={currentOptions} close={currentCloseCallback} />

					{#snippet failed(error, reset)}
						<span class="text-error">Das Modal konnte nicht geladen werden</span>
					{/snippet}
				</svelte:boundary>
			{/if}
			<Dialog.Close class="btn btn-sm btn-circle btn-ghost absolute top-2 right-2 cursor-pointer">
				<LucideX class="size-5" />
				<span class="sr-only">Close</span>
			</Dialog.Close>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

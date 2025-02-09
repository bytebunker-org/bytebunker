<script lang="ts">
	import { Dialog, Label, Separator } from 'bits-ui';
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

		return new Promise((resolve) => {
			currentCloseCallback = ((value?: ModalReturnType<T>) => {
				isOpen = false;
				currentType = undefined;
				currentOptions = undefined;

				resolve(value);
			}) as (value?: ModalReturnType<ModalTypeEnum>) => void;
		});
	}

	setModalContext({
		open
	});
</script>

{@render children()}

{#if isOpen && modalTypeInfo && ModalComponent && currentOptions && currentCloseCallback}
	<Dialog.Root>
		<Dialog.Portal>
			<Dialog.Overlay
				transition={fade}
				transitionConfig={{ duration: 150 }}
				class="fixed inset-0 z-50 bg-black/80"
			/>
			<Dialog.Content transition={flyAndScale} class="modal">
				<ModalComponent options={currentOptions} close={currentCloseCallback} />
				<!--<Dialog.Title
				class="flex w-full items-center justify-center text-lg font-semibold tracking-tight"
				>Create API key</Dialog.Title
			>
			<Separator.Root class="bg-muted -mx-5 mt-5 mb-6 block h-px" />
			<Dialog.Description class="text-foreground-alt text-sm">
				Create and manage API keys. You can create multiple keys to organize your applications.
			</Dialog.Description>
			<div class="flex flex-col items-start gap-1 pt-7 pb-11">
				<Label.Root for="apiKey" class="text-sm font-medium">API Key</Label.Root>
				<div class="relative w-full">
					<input
						id="apiKey"
						class="h-input rounded-card-sm border-border-input bg-background placeholder:text-foreground-alt/50 hover:border-dark-40 focus:ring-foreground focus:ring-offset-background inline-flex w-full items-center border px-4 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
						placeholder="secret_api_key"
						type="password"
						autocomplete="off"
					/>
					<LockKeyOpen class="text-dark/30 absolute top-[14px] right-4 size-[22px]" />
				</div>
			</div>
			<div class="flex w-full justify-end">
				<Dialog.Close
					class="h-input rounded-input bg-dark text-background shadow-mini hover:bg-dark/95 focus-visible:ring-dark focus-visible:ring-offset-background inline-flex items-center justify-center px-[50px] text-[15px] font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-98"
				>
					Save
				</Dialog.Close>
			</div>-->
				<Dialog.Close
					class="focus-visible:ring-foreground focus-visible:ring-offset-background absolute top-5 right-5 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-98"
				>
					<div>
						<LucideX class="size-5" />
						<span class="sr-only">Close</span>
					</div>
				</Dialog.Close>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}

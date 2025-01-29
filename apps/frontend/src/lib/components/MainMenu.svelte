<script lang="ts">
	import { page } from '$app/state';
	import { getUserContext } from '$lib/context';
	import { flyAndScale } from '$lib/util/flyAndScaleTransition.js';
	import { createMutation } from '@tanstack/svelte-query';
	import { Avatar, DropdownMenu } from 'bits-ui';
	import LucideLock from '~icons/lucide/lock';
	import LucideHouse from '~icons/lucide/house';
	import LucideEllipsisVertical from '~icons/lucide/ellipsis-vertical';
	import LucideWorkflow from '~icons/lucide/workflow';
	import LucideSettings from '~icons/lucide/settings';
	import { toastManager } from '$lib/util/toastManager.svelte.js';
	import { AuthApi } from '$lib/api/index.js';

	const user = getUserContext();

	const logoutMutation = createMutation({
		mutationFn: () => AuthApi.logout()
	});

	async function logout() {
		try {
			toastManager.showInfo('Logging out...');

			await $logoutMutation.mutateAsync();
			location.href = '/';
		} catch (error) {
			console.error(error);
			toastManager.showError('Logout failed!');
		}
	}

	let avatarLoadingStatus: Avatar.Props['loadingStatus'] = undefined;
</script>

<div class="bg-base-200 relative min-h-screen px-6 md:block">
	<div class="mb-4 border-b border-neutral-700 py-6">
		<!--<Img
			src={logoImg}
			alt="ByteBunker"
			class="aspect-square max-w-24 rounded-lg border border-neutral-700 object-contain p-1 shadow-md shadow-black/80"
		/>-->
		<h1 class="text-lg font-bold">ByteBunker</h1>
	</div>
	<ul class="main-menu menu rounded-box flex w-full flex-col gap-y-2 overflow-hidden p-0">
		<li>
			<a href="/" class:selected={page.route.id === '/(app)'}>
				<LucideHouse />
				Dashboard</a
			>
		</li>
		<li>
			<a href="/pipelines" class:selected={page.route.id === '/(app)/pipelines'}>
				<LucideWorkflow />
				Pipelines</a
			>
		</li>
		<li>
			<a href="/settings" class:selected={page.route.id === '/(app)/settings'}>
				<LucideSettings />
				Settings</a
			>
		</li>
	</ul>
	<div class="absolute bottom-0 left-0 mb-2 w-full px-2">
		<ul class="menu bg-base-100 w-full p-0">
			<li class="w-full rounded-xl border border-neutral-700">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="flex w-full gap-2.5">
						<Avatar.Root
							bind:loadingStatus={avatarLoadingStatus}
							class="avatar placeholder {avatarLoadingStatus === 'loaded'
								? 'border-neutral-700'
								: 'border-transparent'} uppercase"
						>
							<div
								class="bg-neutral text-neutral-content !flex w-10 items-center justify-center rounded-full"
							>
								<Avatar.Image src="" alt="@{user.username}" />
								<Avatar.Fallback class="text-xl">{user.username?.slice(0, 1)}</Avatar.Fallback>
							</div>
						</Avatar.Root>

						<button
							class="flex w-full items-center justify-between gap-2 text-[15px] font-bold text-neutral-200 lg:gap-4"
						>
							<span>{user.username}</span>
							<LucideEllipsisVertical />
						</button>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						class="bg-base-100 w-full rounded-xl border border-neutral-700 px-1 py-1.5 shadow-md"
						transition={flyAndScale}
						transitionConfig={{ y: 8 }}
						sideOffset={8}
						sameWidth
					>
						<DropdownMenu.Item
							on:click={logout}
							class="flex h-10 w-full cursor-pointer items-center rounded-md py-3 pr-1.5 pl-3 text-sm
                            font-medium !ring-0 !ring-transparent select-none data-[highlighted]:bg-neutral-700"
						>
							<div class="flex items-center gap-2">
								<LucideLock />
								Logout
							</div>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</li>
		</ul>
	</div>
</div>

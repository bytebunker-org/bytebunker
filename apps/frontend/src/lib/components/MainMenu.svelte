<script lang="ts">
	import { page } from '$app/state';
	import { getUserContext } from '$lib/context';
	import { flyAndScale } from '$lib/util/flyAndScaleTransition.js';
	import { createMutation } from '@tanstack/svelte-query';
	import { Avatar, DropdownMenu } from 'bits-ui';
	import LucideList from '~icons/lucide/list';
	import LucideLock from '~icons/lucide/lock';
	import LucideHouse from '~icons/lucide/house';
	import LucideEllipsisVertical from '~icons/lucide/ellipsis-vertical';
	import LucideWorkflow from '~icons/lucide/workflow';
	import LucideCircuitBoard from '~icons/lucide/circuit-board';
	import LucideSettings from '~icons/lucide/settings';
	import LogoIcon from '~icons/custom/logo';
	import { toastManager } from '$lib/util/toastManager.svelte.js';
	import { AuthApi } from '$lib/api/AuthApi.js';

	const user = getUserContext();

	const logoutMutation = createMutation(() => ({
		mutationFn: () => AuthApi.logout()
	}));

	async function logout() {
		try {
			toastManager.showInfo('Logging out...');

			await logoutMutation.mutateAsync();
			location.href = '/';
		} catch (error) {
			console.error(error);
			toastManager.showError('Logout failed!');
		}
	}

	let avatarLoadingStatus: Avatar.Props['loadingStatus'] = undefined;
</script>

<div class="bg-base-200 relative flex min-h-screen flex-col justify-between">
	<div class="px-6">
		<div
			class="mb-4 flex items-center gap-2 border-b border-neutral-200 py-6 dark:border-neutral-700"
		>
			<!--<Img
                src={logoImg}
                alt="ByteBunker"
                class="aspect-square max-w-24 rounded-lg border border-neutral-700 object-contain p-1 shadow-md shadow-black/80"
            />-->
			<LogoIcon class="size-8 text-[#245150]" width="64" height="64" />
			<h1 class="text-lg font-bold">ByteBunker</h1>
		</div>
		<ul class="menu flex w-full">
			<li>
				<a href="/" class:menu-active={page.route.id === '/(app)'}>
					<LucideHouse />
					Home
				</a>
			</li>
			<li>
				<details open>
					<summary>
						<LucideWorkflow />
						Pipelines
					</summary>
					<ul>
						<li>
							<a href="/pipelines" class:menu-active={page.route.id === '/(app)/pipelines'}>
								<LucideList />
								Overview
							</a>
						</li>
						<li>
							<a
								href="/pipelines/blueprints"
								class:menu-active={page.route.id?.startsWith('/(app)/pipelines/blueprints')}
							>
								<LucideCircuitBoard />
								Blueprints
							</a>
						</li>
					</ul>
				</details>
			</li>
			<li>
				<a href="/settings" class:menu-active={page.route.id === '/(app)/settings'}>
					<LucideSettings />
					Settings
				</a>
			</li>
		</ul>
	</div>
	<div class=" w-full p-2">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="btn bg-base-100 btn-xl flex w-full cursor-pointer gap-2.5 px-4 py-6"
			>
				<Avatar.Root
					bind:loadingStatus={avatarLoadingStatus}
					class="avatar placeholder {avatarLoadingStatus === 'loaded'
						? 'border-neutral-700'
						: 'border-transparent'} pointer-events-none uppercase"
				>
					<div
						class="bg-neutral text-neutral-content !flex w-10 items-center justify-center rounded-full"
					>
						<Avatar.Image src="" alt="@{user.username}" />
						<Avatar.Fallback class="text-xl">{user.username?.slice(0, 1)}</Avatar.Fallback>
					</div>
				</Avatar.Root>

				<button
					class="pointer-events-none flex w-full items-center justify-between gap-2 text-[15px] font-bold text-neutral-700 lg:gap-4 dark:text-neutral-200"
				>
					<span>{user.username}</span>
					<LucideEllipsisVertical />
				</button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class=" bg-base-100 rounded-box z-1 shadow-sm"
				transition={flyAndScale}
				transitionConfig={{ y: 8 }}
				sideOffset={8}
				sameWidth
			>
				<ul class="menu w-full">
					<DropdownMenu.Item>
						<li class="flex w-full items-center gap-2">
							<button class="w-full" on:click={logout}>
								<LucideLock />
								Logout
							</button>
						</li>
					</DropdownMenu.Item>
				</ul>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
	<!--<div class="">

        <ul class="menu bg-base-100 w-full overflow-hidden rounded-xl p-0">
            <li class="rounded-box w-full border border-neutral-700">
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger class="btn btn-xl flex w-full gap-2.5">
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
                            class="flex w-full items-center justify-between gap-2 text-[15px] font-bold text-neutral-700 lg:gap-4 dark:text-neutral-200"
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
    </div>-->
</div>

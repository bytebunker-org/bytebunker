<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideMessageSquare from '~icons/lucide/message-square';
	import LucideImage from '~icons/lucide/image';
	import LucideTrash from '~icons/lucide/trash-2';
	import {
		getMessageView,
		pluralize,
		truncate,
		type MessageView
	} from '$lib/components/activity/activityDataUtil.js';

	const MAX_BUBBLES = 8;
	const MAX_TEXT_LENGTH = 160;

	let props: ActivityPropsInterface<ASActivity> = $props();

	let messages = $derived(
		props.mergedActivities?.length ? props.mergedActivities : [props.activity]
	);
	let views = $derived(messages.map(getMessageView));
	let shown = $derived(views.slice(0, MAX_BUBBLES));
	let peerName = $derived(views.find((v) => v.peerName)?.peerName);
</script>

{#snippet bubble(message: MessageView)}
	<div
		class={[
			'chat',
			message.direction === 'outgoing' ? 'chat-end' : 'chat-start',
			'max-w-[70vw] lg:max-w-[30vw]'
		]}
	>
		<div
			class={[
				'chat-bubble min-h-0 py-1 text-sm',
				message.direction === 'outgoing' ? 'chat-bubble-primary' : ''
			]}
		>
			{#if message.kind === 'deleted'}
				<span class="flex items-center gap-1 italic opacity-70"
					><LucideTrash class="size-3.5" />Deleted message</span
				>
			{:else if message.kind !== 'text' && !message.text}
				<span class="flex items-center gap-1 italic opacity-80"
					><LucideImage class="size-3.5" />{message.kind === 'media' ? 'Media' : message.kind}</span
				>
			{:else if message.text}
				<span class="break-words whitespace-pre-line"
					>{truncate(message.text, MAX_TEXT_LENGTH)}</span
				>{#if message.edited}<span class="ml-1 text-xs opacity-60">(edited)</span>{/if}
			{:else}
				<span class="italic opacity-70">Empty message</span>
			{/if}
		</div>
	</div>
{/snippet}

<ActivityCard {...props} icon={LucideMessageSquare} type="Create">
	<div class="flex flex-col gap-0.5">
		<span class="font-bold text-neutral-700">
			{#if peerName}{peerName}{:else}Conversation{/if}
			{#if messages.length > 1}
				<span class="text-sm font-normal text-neutral-500"
					>{pluralize(messages.length, 'message')}</span
				>
			{/if}
		</span>
		{#each shown as message, i (i)}
			{@render bubble(message)}
		{/each}
		{#if views.length > MAX_BUBBLES}
			<span class="text-sm text-neutral-400">+{views.length - MAX_BUBBLES} more</span>
		{/if}
	</div>
</ActivityCard>

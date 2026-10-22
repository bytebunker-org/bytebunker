<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucidePlus from '~icons/lucide/plus';
	import MessageActivity from './MessageActivity.svelte';
	import ReviewActivity from './ReviewActivity.svelte';
	import { asText, hasSecondaryType, nameOf } from '$lib/components/activity/activityDataUtil.js';

	let props: ActivityPropsInterface<ASActivity> = $props();
</script>

{#if hasSecondaryType(props.activity, 'Message')}
	<MessageActivity {...props} />
{:else if hasSecondaryType(props.activity, 'Review')}
	<ReviewActivity {...props} />
{:else}
	<ActivityCard {...props} icon={LucidePlus} type="Create">
		Created {nameOf(props.activity.object) ?? asText(props.activity.summary) ?? 'something'}
	</ActivityCard>
{/if}

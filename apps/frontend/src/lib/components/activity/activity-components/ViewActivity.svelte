<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import BrowserVisitActivity from './BrowserVisitActivity.svelte';
	import GoogleViewActivity from './GoogleViewActivity.svelte';
	import YouTubeViewActivity from './YouTubeViewActivity.svelte';
	import { getViewKind } from '$lib/components/activity/activityDataUtil.js';

	let props: ActivityPropsInterface<ASActivity> = $props();

	let kind = $derived(getViewKind(props.activity));
</script>

{#if kind === 'browser'}
	<BrowserVisitActivity {...props} />
{:else if kind === 'youtube'}
	<YouTubeViewActivity {...props as ActivityPropsInterface<any>} />
{:else}
	<GoogleViewActivity {...props} />
{/if}

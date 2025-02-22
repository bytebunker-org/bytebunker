import type { Component } from 'svelte';
import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
import type { ASActivity, ActivityType } from '@bytebunker/event-schema';
import MoveActivity from '$lib/components/activity/activity-components/MoveActivity.svelte';
import ArriveActivity from '$lib/components/activity/activity-components/ArriveActivity.svelte';

export const activityComponentMap: Partial<
	Record<ActivityType, Component<ActivityPropsInterface<ASActivity>>>
> = {
	Move: MoveActivity,
	Arrive: ArriveActivity
};

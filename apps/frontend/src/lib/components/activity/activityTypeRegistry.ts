import type { Component } from 'svelte';
import type {
	ActivityCardSize,
	ActivityPropsInterface
} from '$lib/components/activity/ActivityPropsInterface.js';
import type { ActivityType, ASActivity, Place } from '@bytebunker/event-schema';
import MoveActivity from '$lib/components/activity/activity-components/MoveActivity.svelte';
import ArriveActivity from '$lib/components/activity/activity-components/ArriveActivity.svelte';
import ListenActivity from '$lib/components/activity/activity-components/ListenActivity.svelte';
import LucideRoute from '~icons/lucide/route';
import LucideMapPin from '~icons/lucide/map-pin';
import LucideMusic from '~icons/lucide/music';
import type {
	MaterialColorName,
	MaterialColorShade
} from '$lib/util/materialColor/materialColors.js';
import {
	getMaterialColorDetails,
	hashTextToMaterialStyleColor,
	isLightColor
} from '$lib/util/materialColor/colorUtil.js';
import LucideCircleHelp from '~icons/lucide/circle-help';
import GenericActivity from '$lib/components/activity/activity-components/GenericActivity.svelte';
import type { SingleActivityTimelineEntry } from '$lib/components/activity/activityTimelineUtil.js';
import type { GoogleTimelineActivityInterface } from '@bytebunker/backend';
import { calculateActivityDistance } from '$lib/components/activity/activityUtil.js';
import { hasOwn } from '$lib/util/util.js';

export interface ActivityTypeInfo {
	component: Component<ActivityPropsInterface<any>>;
	componentSupportsMergedSize: boolean;
	defaultIcon: Component;
	summarize: <T extends ASActivity>(activity: T) => string;
	summarizeMultiple: <T extends ASActivity>(activity: T[]) => string;
	getCardSize: <T extends ASActivity>(
		activityEntry: SingleActivityTimelineEntry<T>,
		index: number
	) => ActivityCardSize;
	allowNestedActivities: boolean;
	allowMerging: boolean;
	allowNesting: boolean;
	backgroundColor: string;
	color: string;
	foreground: 'light' | 'dark';
}

export const activityTypeRegistry = new Map<ActivityType, ActivityTypeInfo>();

function buildDefaultSummarize(summarizeMultiple?: (activities: ASActivity[]) => string) {
	return (activity: ASActivity) => {
		if (summarizeMultiple) {
			return summarizeMultiple([activity]);
		} else {
			return activity['@type'];
		}
	};
}

function buildDefaultSummarizeMultiple(summarizeSingle?: (activity: ASActivity) => string) {
	return (activities: ASActivity[]) => {
		if (summarizeSingle) {
			return activities.map((a) => summarizeSingle(a)).join(', ');
		} else {
			return `${activities.length}x ${activities[0]['@type']}`;
		}
	};
}

function registerActivityType(
	type: ActivityType,
	options: Partial<ActivityTypeInfo> &
		Required<Pick<ActivityTypeInfo, 'component'>> & {
			materialColor?: MaterialColorName;
			materialColorShade?: MaterialColorShade;
		}
): ActivityTypeInfo {
	const materialColor = options.materialColor
		? getMaterialColorDetails(options.materialColor, options.materialColorShade ?? 800)
		: hashTextToMaterialStyleColor(type, 800);

	let foreground: 'light' | 'dark';

	if (options.color) {
		foreground = isLightColor(options.color) ? 'light' : 'dark';
	} else if (options.backgroundColor) {
		foreground = isLightColor(options.backgroundColor) ? 'dark' : 'light';
	} else {
		foreground = materialColor.foreground;
	}

	const info: ActivityTypeInfo = {
		component: options.component,
		componentSupportsMergedSize: options.componentSupportsMergedSize ?? false,
		defaultIcon: options.defaultIcon ?? LucideCircleHelp,
		summarize: options.summarize ?? buildDefaultSummarize(options.summarizeMultiple),
		summarizeMultiple:
			options.summarizeMultiple ?? buildDefaultSummarizeMultiple(options.summarize),
		getCardSize: options.getCardSize ?? (() => 'md'),
		backgroundColor: options.backgroundColor ?? materialColor.backgroundColor,
		color: options.color ?? materialColor.color,
		foreground: foreground,
		allowNestedActivities: options.allowNestedActivities ?? true,
		allowMerging: options.allowMerging ?? false,
		allowNesting: options.allowNesting ?? false
	};

	activityTypeRegistry.set(type, info);

	return info;
}

export function getActivityTypeData(type: ActivityType): ActivityTypeInfo {
	return activityTypeRegistry.get(type) ?? activityTypeRegistry.get('Generic' as ActivityType)!;
}

registerActivityType('Generic' as ActivityType, {
	component: GenericActivity,
	materialColor: 'Grey'
});

registerActivityType('Move', {
	component: MoveActivity,
	defaultIcon: LucideRoute,
	materialColor: 'Orange',
	materialColorShade: 800,
	getCardSize: ({
		activity
	}: SingleActivityTimelineEntry<GoogleTimelineActivityInterface & ASActivity>) => {
		const movedDistanceKm = calculateActivityDistance(activity);

		if (typeof movedDistanceKm === 'undefined') {
			return 'md';
		}

		const hasPlaceNames = hasOwn(activity.origin, 'name') && hasOwn(activity.target, 'name');

		if (movedDistanceKm > 5 && hasPlaceNames) {
			return 'md';
		} else if (movedDistanceKm > 5) {
			return 'lg';
		}

		return 'sm';
	}
});

registerActivityType('Arrive', {
	component: ArriveActivity,
	defaultIcon: LucideMapPin,
	materialColor: 'Deep Orange',
	materialColorShade: 800
});

registerActivityType('Listen', {
	component: ListenActivity,
	defaultIcon: LucideMusic,
	materialColor: 'Teal',
	materialColorShade: 800,
	allowMerging: true,
	allowNesting: true,
	summarizeMultiple: (activities) => {
		const songNames = activities.map((s) => s.object?.name).filter(Boolean);

		if (songNames.length === 1) {
			return `Listened to ${songNames[0]}`;
		} else if (songNames.length === 2) {
			return `Listened to ${songNames[0]} and ${songNames[1]}`;
		} else {
			const moreAmount = songNames.length - 2;
			return `Listened to ${songNames[0]}, ${songNames[1]} and ${moreAmount} more song${moreAmount > 1 ? 's' : ''}`;
		}
	}
});

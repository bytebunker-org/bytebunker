import type { Component } from 'svelte';
import type {
	ActivityCardSize,
	ActivityPropsInterface
} from '$lib/components/activity/ActivityPropsInterface.js';
import type { ActivityType, ASActivity } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import MoveActivity from '$lib/components/activity/activity-components/MoveActivity.svelte';
import ArriveActivity from '$lib/components/activity/activity-components/ArriveActivity.svelte';
import ListenActivity from '$lib/components/activity/activity-components/ListenActivity.svelte';
import EventActivity from '$lib/components/activity/activity-components/EventActivity.svelte';
import ViewActivity from '$lib/components/activity/activity-components/ViewActivity.svelte';
import SearchActivity from '$lib/components/activity/activity-components/SearchActivity.svelte';
import CreateActivity from '$lib/components/activity/activity-components/CreateActivity.svelte';
import AddActivity from '$lib/components/activity/activity-components/AddActivity.svelte';
import LucideRoute from '~icons/lucide/route';
import LucideMapPin from '~icons/lucide/map-pin';
import LucideMusic from '~icons/lucide/music';
import LucideCalendar from '~icons/lucide/calendar';
import LucideYoutube from '~icons/lucide/youtube';
import LucideSearch from '~icons/lucide/search';
import LucideMessageSquare from '~icons/lucide/message-square';
import LucideBookmark from '~icons/lucide/bookmark';
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
import {
	canMergeMessages,
	getMessageView,
	getSearchQuery,
	getViewKind,
	getVisitUrl,
	hasSecondaryType,
	nameOf,
	pluralize,
	summarizeBrowserVisits,
	truncate,
	type Loose
} from '$lib/components/activity/activityDataUtil.js';

export interface ActivityTypeInfo {
	component: Component<ActivityPropsInterface<any>>;
	componentSupportsMergedSize: boolean;
	/** Narrows `componentSupportsMergedSize` for a concrete collection (e.g. only browser visits). */
	supportsMergedSize?: (activities: ASActivity[]) => boolean;
	/**
	 * Decides whether `next` may join a collection whose last item is `previous`. Both are of a
	 * mergeable type; by default every consecutive activity of the same `@type` merges.
	 */
	canMerge?: (previous: ASActivity, next: ASActivity) => boolean;
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
		supportsMergedSize: options.supportsMergedSize,
		canMerge: options.canMerge,
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

registerActivityType('Event', {
	component: EventActivity,
	defaultIcon: LucideCalendar,
	materialColor: 'Indigo',
	materialColorShade: 800,
	summarize: (activity) => (activity as { summary?: string }).summary ?? 'Event'
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

registerActivityType('View', {
	component: ViewActivity,
	defaultIcon: LucideYoutube,
	materialColor: 'Red',
	materialColorShade: 800,
	allowMerging: true,
	allowNesting: true,
	componentSupportsMergedSize: true,
	// only browser visits have a dedicated merged card, other views fall back to the expandable list
	supportsMergedSize: (activities) => activities.every((a) => getViewKind(a) === 'browser'),
	// keep browser visits, videos and other Google views in separate collections
	canMerge: (previous, next) => getViewKind(previous) === getViewKind(next),
	summarizeMultiple: (activities) => {
		if (activities.every((a) => getViewKind(a) === 'browser')) {
			const { total, domains } = summarizeBrowserVisits(activities);
			const top = domains
				.slice(0, 2)
				.map((d) => d.host)
				.join(', ');
			return `Visited ${pluralize(total, 'page')}${top ? ` on ${top}` : ''}`;
		}

		const titles = activities.map((s) => nameOf(s.object)).filter(Boolean);
		const verb = activities.every((a) => getViewKind(a) === 'youtube') ? 'Watched' : 'Viewed';

		if (titles.length === 0) {
			return `${verb} ${pluralize(activities.length, 'item')}`;
		} else if (titles.length === 1) {
			return `${verb} ${titles[0]}`;
		} else if (titles.length === 2) {
			return `${verb} ${titles[0]} and ${titles[1]}`;
		} else {
			const moreAmount = titles.length - 2;
			return `${verb} ${titles[0]}, ${titles[1]} and ${moreAmount} more`;
		}
	}
});

registerActivityType(createUnknownASType('Search'), {
	component: SearchActivity,
	defaultIcon: LucideSearch,
	materialColor: 'Blue',
	materialColorShade: 800,
	allowMerging: true,
	componentSupportsMergedSize: true,
	summarizeMultiple: (activities) => {
		if (activities.length === 1) {
			const query = getSearchQuery(activities[0]);
			return query ? `Searched for "${truncate(query, 40)}"` : 'Search';
		}
		return `${activities.length} searches`;
	}
});

registerActivityType('Create', {
	component: CreateActivity,
	defaultIcon: LucideMessageSquare,
	materialColor: 'Green',
	materialColorShade: 800,
	// only messages merge into a chat card, reviews and other creations stay separate
	allowMerging: true,
	componentSupportsMergedSize: true,
	supportsMergedSize: (activities) => activities.every((a) => hasSecondaryType(a, 'Message')),
	canMerge: (previous, next) =>
		hasSecondaryType(previous, 'Message') &&
		hasSecondaryType(next, 'Message') &&
		canMergeMessages(previous, next),
	summarizeMultiple: (activities) => {
		const first = activities[0];

		if (hasSecondaryType(first, 'Message')) {
			const peer = activities.map((a) => getMessageView(a).peerName).find(Boolean);
			const count = pluralize(activities.length, 'message');
			return peer ? `${count} with ${peer}` : count;
		}

		if (hasSecondaryType(first, 'Review')) {
			const target = nameOf((first as Loose).target);
			return target ? `Reviewed ${target}` : 'Wrote a review';
		}

		return `Created ${nameOf(first.object) ?? 'something'}`;
	}
});

registerActivityType('Add', {
	component: AddActivity,
	defaultIcon: LucideBookmark,
	materialColor: 'Amber',
	materialColorShade: 800,
	summarizeMultiple: (activities) => {
		const names = activities.map((a) => nameOf(a.object) ?? getVisitUrl(a)).filter(Boolean);
		const verb = activities.every((a) => hasSecondaryType(a, 'SavedPlace'))
			? 'Saved'
			: 'Bookmarked';

		if (names.length === 0) {
			return `${verb} ${pluralize(activities.length, 'item')}`;
		}
		return names.length === 1
			? `${verb} ${names[0]}`
			: `${verb} ${names[0]} and ${names.length - 1} more`;
	}
});

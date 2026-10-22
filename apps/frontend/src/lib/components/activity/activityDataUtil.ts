import type { ASActivity } from '@bytebunker/event-schema';

export type Loose = Record<string, any>;

/**
 * Nested objects arrive either as objects or as JSON strings (the graph stores non-relationship
 * nested data as JSON). Returns the parsed value, or the input if it is not a JSON string.
 */
export function parseJsonish(value: unknown): unknown {
	if (typeof value !== 'string') {
		return value;
	}

	const trimmed = value.trim();
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
		return value;
	}

	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}

export function asRecord(value: unknown): Loose | undefined {
	const parsed = parseJsonish(value);
	if (Array.isArray(parsed)) {
		return asRecord(parsed[0]);
	}
	return parsed && typeof parsed === 'object' ? (parsed as Loose) : undefined;
}

export function asArray(value: unknown): unknown[] {
	const parsed = parseJsonish(value);
	if (Array.isArray(parsed)) {
		return parsed;
	}
	return parsed === undefined || parsed === null || parsed === '' ? [] : [parsed];
}

export function asText(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
	const num = typeof value === 'string' && value.trim() ? Number(value) : value;
	return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
}

export function asBoolean(value: unknown): boolean {
	return value === true || value === 'true';
}

/** Display name of a value that may be a plain string, an object with a name, or a list of those. */
export function nameOf(value: unknown): string | undefined {
	const parsed = parseJsonish(value);
	if (Array.isArray(parsed)) {
		const names = parsed.map(nameOf).filter(Boolean);
		return names.length ? names.join(', ') : undefined;
	}
	return typeof parsed === 'string' ? asText(parsed) : asText(asRecord(parsed)?.name);
}

export function getSecondaryTypes(activity: ASActivity): string[] {
	return asArray((activity as Loose)['@secondaryTypes']).filter(
		(t): t is string => typeof t === 'string'
	);
}

export function hasSecondaryType(activity: ASActivity, type: string): boolean {
	return getSecondaryTypes(activity).includes(type);
}

export function getHostname(url: unknown): string | undefined {
	const text = asText(url);
	if (!text) {
		return;
	}

	try {
		return new URL(text).hostname.replace(/^www\./, '') || undefined;
	} catch {
		return;
	}
}

/** Only http(s) URLs are safe to render as links. */
export function safeHref(url: unknown): string | undefined {
	const text = asText(url);
	return text && /^https?:\/\//i.test(text) ? text : undefined;
}

export function truncate(text: string, maxLength: number): string {
	return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

export function toMillis(activity: ASActivity): number | undefined {
	const start = activity.startTime as { toMillis?: () => number } | string | undefined;
	if (!start) {
		return;
	}
	if (typeof start === 'string') {
		const parsed = Date.parse(start);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	return typeof start.toMillis === 'function' ? start.toMillis() : undefined;
}

// --- Search -------------------------------------------------------------------------------

export function getSearchQuery(activity: ASActivity): string | undefined {
	return asText((activity as Loose).query);
}

export function getSearchSource(activity: ASActivity): string | undefined {
	const a = activity as Loose;
	return asText(a.product) ?? nameOf(a.generator);
}

// --- Messages -----------------------------------------------------------------------------

export type MessageDirection = 'incoming' | 'outgoing';

export interface MessageView {
	direction: MessageDirection;
	text?: string;
	kind: string;
	edited: boolean;
	peerName?: string;
}

export function getMessageView(activity: ASActivity): MessageView {
	const a = activity as Loose;
	const direction: MessageDirection = a.direction === 'incoming' ? 'incoming' : 'outgoing';
	// the "other" person is the sender for incoming and the recipient for outgoing messages
	const peer = asRecord(direction === 'incoming' ? a.actor : a.target);

	return {
		direction,
		text: asText(asRecord(a.object)?.content),
		kind: asText(a.messageKind) ?? 'text',
		edited: asBoolean(a.edited),
		peerName: asText(peer?.name)
	};
}

export function isSameConversation(a: ASActivity, b: ASActivity): boolean {
	return ((a as Loose).conversationId ?? null) === ((b as Loose).conversationId ?? null);
}

export const MESSAGE_MERGE_WINDOW_MS = 30 * 60 * 1000;

export function canMergeMessages(previous: ASActivity, next: ASActivity): boolean {
	if (!isSameConversation(previous, next)) {
		return false;
	}

	const prevTime = toMillis(previous);
	const nextTime = toMillis(next);
	return (
		prevTime === undefined ||
		nextTime === undefined ||
		Math.abs(nextTime - prevTime) <= MESSAGE_MERGE_WINDOW_MS
	);
}

// --- Browser visits -----------------------------------------------------------------------

export interface BrowserVisitSummary {
	total: number;
	domains: { host: string; count: number }[];
	topTitles: string[];
}

export function getVisitUrl(activity: ASActivity): string | undefined {
	return asText(asRecord(activity.object)?.pageUrl);
}

export function summarizeBrowserVisits(
	activities: ASActivity[],
	maxTitles = 3
): BrowserVisitSummary {
	const domainCounts = new Map<string, number>();
	const titleCounts = new Map<string, number>();

	for (const activity of activities) {
		const page = asRecord(activity.object);
		const host = getHostname(page?.pageUrl) ?? 'unknown';
		domainCounts.set(host, (domainCounts.get(host) ?? 0) + 1);

		const title = asText(page?.name);
		if (title) {
			titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
		}
	}

	const byCountDesc = (a: [string, number], b: [string, number]) => b[1] - a[1];

	return {
		total: activities.length,
		domains: [...domainCounts.entries()]
			.sort(byCountDesc)
			.map(([host, count]) => ({ host, count })),
		topTitles: [...titleCounts.entries()]
			.sort(byCountDesc)
			.slice(0, maxTitles)
			.map(([title]) => title)
	};
}

// --- View classification ------------------------------------------------------------------

export type ViewKind = 'browser' | 'youtube' | 'google';

export function getViewKind(activity: ASActivity): ViewKind {
	if (hasSecondaryType(activity, 'BrowserVisit')) {
		return 'browser';
	}

	const objectType = asRecord(activity.object)?.['@type'];
	if (
		hasSecondaryType(activity, 'YouTubeViewActivity') ||
		objectType === 'Video' ||
		objectType === 'YouTubeVideo'
	) {
		return 'youtube';
	}

	return 'google';
}

// --- Events -------------------------------------------------------------------------------

export interface AttendeeView {
	name?: string;
	email?: string;
	status?: string;
}

export function getAttendees(activity: ASActivity): AttendeeView[] {
	return asArray((activity as Loose).attendees)
		.map((entry): AttendeeView | undefined => {
			if (typeof entry === 'string') {
				return asText(entry) ? { email: entry } : undefined;
			}
			const record = asRecord(entry);
			return record
				? {
						name: asText(record.name),
						email: asText(record.email),
						status: asText(record.status)
					}
				: undefined;
		})
		.filter((a): a is AttendeeView => !!a);
}

export function getOrganizerLabel(organizer: unknown): string | undefined {
	const record = asRecord(organizer);
	return record ? (asText(record.name) ?? asText(record.email)) : asText(organizer);
}

// --- Listen -------------------------------------------------------------------------------

export const SHORT_PLAY_MS = 30_000;

export function isShortPlay(msPlayed: number | undefined): boolean {
	return msPlayed !== undefined && msPlayed < SHORT_PLAY_MS;
}

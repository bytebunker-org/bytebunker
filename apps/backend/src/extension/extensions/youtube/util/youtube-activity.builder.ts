import type { DateTime } from 'luxon';
import type { ASObject, Audio, Listen, View } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import type { YouTubeWatchEntry } from '@bytebunker/event-schema/extension/youtube';
import type { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import type { YouTubeViewActivityInterface } from '../type/youtube-view-activity.interface.js';
import type { YouTubeVideoObjectInterface } from '../type/youtube-video-object.interface.js';

/**
 * Builds YouTube view/listen activities. Shared by the watch history import and the Google "My Activity" import so
 * the same view gets the same stable keys from both files.
 */
export interface YouTubeActivityBuildContext {
    stableKeyService: ActivityStableKeyService;
    generator: ASObject;
    actorId: string;
}

const VIDEO_ID_PATTERN = /[&?]v=([^#&]+)/;
const SHORT_URL_PATTERN = /^https?:\/\/youtu\.be\/([^#&/?]+)/;
const CHANNEL_ID_PATTERN = /\/channel\/([^#/?]+)/;

export function extractYouTubeVideoId(url: string): string | undefined {
    return VIDEO_ID_PATTERN.exec(url)?.[1] ?? SHORT_URL_PATTERN.exec(url)?.[1];
}

export function extractYouTubeChannelId(url: string): string | undefined {
    return CHANNEL_ID_PATTERN.exec(url)?.[1];
}

/** Activity key of a watch: the video and the watch time to the minute. */
export function youTubeWatchStableKey(
    stableKeyService: ActivityStableKeyService,
    type: 'View' | 'Listen',
    watchedAt: DateTime,
    videoId: string,
): string {
    return stableKeyService.createActivityStableKey(
        type,
        { start: watchedAt, videoId },
        { dateTimePrecision: 'minute' },
    );
}

export function buildYouTubeVideoObject(
    stableKeyService: ActivityStableKeyService,
    video: Pick<YouTubeWatchEntry, 'videoId' | 'videoUrl' | 'channelName' | 'channelId' | 'channelUrl'> & {
        title?: string;
    },
): Audio & YouTubeVideoObjectInterface {
    return {
        '@type': 'Video' as Audio['@type'],
        '@secondaryTypes': [createUnknownASType('YouTubeVideo')],
        stableKeys: [stableKeyService.createASObjectStableKey('Video', { videoId: video.videoId })],
        ...(video.title === undefined ? {} : { name: video.title }),
        videoId: video.videoId,
        videoUrl: video.videoUrl,
        ...(video.channelName ? { channelName: video.channelName } : {}),
        ...(video.channelId ? { channelId: video.channelId } : {}),
        ...(video.channelUrl ? { channelUrl: video.channelUrl } : {}),
    } as Audio & YouTubeVideoObjectInterface;
}

export function buildYouTubeViewActivity(
    entry: YouTubeWatchEntry,
    watchedAt: DateTime<true>,
    { stableKeyService, generator, actorId }: YouTubeActivityBuildContext,
): View & YouTubeViewActivityInterface {
    return {
        '@type': 'View',
        '@secondaryTypes': [createUnknownASType('YouTubeViewActivity')],
        generator,
        stableKeys: [youTubeWatchStableKey(stableKeyService, 'View', watchedAt, entry.videoId)],
        actor: {
            '@id': actorId,
            '@type': 'Person',
        },
        startTime: watchedAt,
        product: entry.product,
        object: buildYouTubeVideoObject(stableKeyService, entry),
    } satisfies View & YouTubeViewActivityInterface;
}

export function buildYouTubeListenActivity(
    entry: YouTubeWatchEntry,
    watchedAt: DateTime<true>,
    { stableKeyService, generator, actorId }: YouTubeActivityBuildContext,
): Listen {
    const identifier = `youtube:track:${entry.videoId}`;

    const audioObject: Audio = {
        '@type': 'Audio',
        '@secondaryTypes': [createUnknownASType('MusicRecording')],
        stableKeys: [stableKeyService.createASObjectStableKey('Audio', { identifier })],
        name: entry.title,
        ...(entry.channelName ? { byArtist: stripTopicSuffix(entry.channelName) } : {}),
        identifier,
    } as Audio;

    return {
        '@type': 'Listen',
        generator,
        stableKeys: [youTubeWatchStableKey(stableKeyService, 'Listen', watchedAt, entry.videoId)],
        actor: {
            '@id': actorId,
            '@type': 'Person',
        },
        startTime: watchedAt,
        object: audioObject,
    } satisfies Listen;
}

/**
 * YouTube Music auto-generated artist channels are named like `NERO - Topic` — the artist is the
 * portion before the suffix. Channels without that suffix are user-uploaded; return as-is.
 */
function stripTopicSuffix(channelName: string): string {
    return channelName.replace(/\s*-\s*Topic\s*$/, '').trim() || channelName;
}

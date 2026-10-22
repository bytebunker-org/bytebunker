import { Items, Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ASObject } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import type { FileDetection, FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import { SPOTIFY_EXTENSION, SPOTIFY_EXTENSION_ID } from '../../local-extension.constant.js';
import {
    type SpotifyContentType,
    type SpotifyStreamingHistoryEntry,
    SpotifySkipReasonEnum,
} from '../type/spotify-streaming-history-entry.interface.js';

@PipelineModuleJsonSchema()
export class SpotifySkippedRowsDto {
    @Required()
    @Type('integer')
    public total!: number;

    /** Skipped rows per reason, e.g. `{ "noContentUri": 1, "duplicateRow": 12 }`. */
    @Required()
    @Type('object')
    public byReason!: Partial<Record<SpotifySkipReasonEnum, number>>;
}

@PipelineModuleJsonSchema()
export class TransformSpotifyStreamingHistoryInput {
    @Required()
    public rawJson!: AssetDto;
}

@PipelineModuleJsonSchema()
export class TransformSpotifyStreamingHistoryOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];

    /** Rows that did not become an activity. Absent when every row was imported. */
    @Optional()
    public skipped?: SpotifySkippedRowsDto;
}

interface SpotifyContent {
    type: SpotifyContentType;
    uri: string;
}

type ActivityRecord = Record<string, unknown> & { stableKeys: string[]; properties: { msPlayed: number } };

const VIDEO_FILE_NAME = /Streaming_History_Video/i;
const PROGRESS_INTERVAL = 5000;

/**
 * Spotify Extended Streaming History (account privacy export, `Streaming_History_{Audio,Video}_*.json`). Audio rows
 * become `Listen` activities of a track, podcast episode or audiobook chapter; video rows (music videos, video
 * podcasts) become `View` activities of a `Video`. Invalid rows are skipped and counted instead of failing the file.
 */
@PipelineModule({
    extensionName: SPOTIFY_EXTENSION,
    inputType: TransformSpotifyStreamingHistoryInput,
    outputType: TransformSpotifyStreamingHistoryOutput,
})
export class TransformSpotifyStreamingHistoryPipelineModule
    implements IPipelineModule<TransformSpotifyStreamingHistoryInput, TransformSpotifyStreamingHistoryOutput>
{
    private readonly logger = new Logger(TransformSpotifyStreamingHistoryPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public detectFile(sample: FileSample): FileDetection | undefined {
        if (
            sample.extension !== 'json' ||
            !/^\s*\[\s*\{\s*"ts"\s*:/.test(sample.head) ||
            !/"ms_played"\s*:/.test(sample.head) ||
            !/"spotify_track_uri"\s*:/.test(sample.head)
        ) {
            return undefined;
        }

        return {
            confidence: 0.95,
            format: VIDEO_FILE_NAME.test(sample.fileName)
                ? 'Spotify Extended Streaming History (video)'
                : 'Spotify Extended Streaming History (audio)',
        };
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<TransformSpotifyStreamingHistoryInput>): Promise<TransformSpotifyStreamingHistoryOutput> {
        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(em, SPOTIFY_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;
        const fileName = inputData.rawJson.originalFilename ?? 'streaming history';

        progress.message(`Reading ${fileName}`);
        const rows = JSON.parse(await this.assetService.getAssetString(em, inputData.rawJson)) as unknown;

        if (!Array.isArray(rows)) {
            throw new Error(`${fileName} is not a Spotify streaming history (expected a JSON array of plays)`);
        }

        return this.transformRows(rows, {
            isVideo: VIDEO_FILE_NAME.test(fileName),
            generatorExtensionObject,
            actorId,
            progress,
        });
    }

    public transformRows(
        rows: unknown[],
        {
            isVideo,
            generatorExtensionObject,
            actorId,
            progress,
        }: Pick<PipelineModuleExecutionContext<unknown>, 'progress'> & {
            isVideo: boolean;
            generatorExtensionObject: ASObject;
            actorId: string;
        },
    ): TransformSpotifyStreamingHistoryOutput {
        const activities: ActivityRecord[] = [];
        // First stable key → index in `activities`, to merge plays Spotify logged twice.
        const indexByKey = new Map<string, number>();
        const byReason: Partial<Record<SpotifySkipReasonEnum, number>> = {};
        const skip = (reason: SpotifySkipReasonEnum): void => {
            byReason[reason] = (byReason[reason] ?? 0) + 1;
        };

        for (const [index, row] of rows.entries()) {
            if (index % PROGRESS_INTERVAL === 0) {
                progress.report({ current: index, total: rows.length, unit: 'rows', message: 'Transforming plays' });
            }

            const result = this.transformRow(row, isVideo, generatorExtensionObject, actorId);

            if (typeof result === 'string') {
                skip(result);
                continue;
            }

            const key = result.stableKeys[0]!;
            const previousIndex = indexByKey.get(key);

            if (previousIndex === undefined) {
                indexByKey.set(key, activities.length);
                activities.push(result);
                continue;
            }

            // Same content ending in the same second: one play reported twice (mostly offline plays synced again).
            // Keep the row with the longer playback.
            skip(SpotifySkipReasonEnum.DUPLICATE_ROW);

            if (result.properties.msPlayed > activities[previousIndex]!.properties.msPlayed) {
                activities[previousIndex] = result;
            }
        }

        const total = Object.values(byReason).reduce((sum, count) => sum + count, 0);

        progress.report({
            current: rows.length,
            total: rows.length,
            unit: 'rows',
            message: total
                ? `${activities.length} plays, skipped ${total} rows (${Object.entries(byReason)
                      .map(([reason, count]) => `${reason}: ${count}`)
                      .join(', ')})`
                : `${activities.length} plays`,
        });

        if (total) {
            this.logger.warn(`Skipped ${total} of ${rows.length} streaming history rows: ${JSON.stringify(byReason)}`);
        }

        return {
            activities: activities.map(({ properties, ...activity }) => ({
                ...activity,
                ...properties,
            })) as unknown as ActivityDto[],
            ...(total ? { skipped: { total, byReason } } : {}),
        };
    }

    private transformRow(
        row: unknown,
        isVideo: boolean,
        generatorExtensionObject: ASObject,
        actorId: string,
    ): ActivityRecord | SpotifySkipReasonEnum {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            return SpotifySkipReasonEnum.NOT_AN_OBJECT;
        }

        const entry = row as SpotifyStreamingHistoryEntry;
        const endTime = typeof entry.ts === 'string' ? DateTime.fromISO(entry.ts, { zone: 'utc' }) : undefined;

        if (!endTime?.isValid) {
            return SpotifySkipReasonEnum.INVALID_TIMESTAMP;
        }

        const msPlayed = entry.ms_played;

        if (typeof msPlayed !== 'number' || !Number.isFinite(msPlayed) || msPlayed < 0) {
            return SpotifySkipReasonEnum.INVALID_MS_PLAYED;
        }

        const content = getContent(entry);

        if (!content) {
            return SpotifySkipReasonEnum.NO_CONTENT_URI;
        }

        const activityType = isVideo ? 'View' : 'Listen';

        return {
            '@type': activityType,
            '@secondaryTypes': [createUnknownASType(isVideo ? 'SpotifyViewActivity' : 'SpotifyListenActivity')],
            generator: generatorExtensionObject,
            // `ts` is unique per play of one URI, also for quick skips; minute precision collided.
            stableKeys: [
                this.activityStableKeyService.createActivityStableKey(
                    activityType,
                    { end: endTime, identifier: content.uri },
                    { dateTimePrecision: 'second' },
                ),
            ],
            actor: { '@id': actorId, '@type': 'Person' },
            summary: summarize(entry, content, msPlayed, isVideo),
            object: isVideo ? this.buildVideo(entry, content) : this.buildAudio(entry, content),
            startTime: endTime.minus({ milliseconds: msPlayed }),
            endTime,
            properties: {
                msPlayed,
                ...definedProperties({
                    platform: entry.platform,
                    country: entry.conn_country,
                    ipAddress: entry.ip_addr,
                    reasonStart: entry.reason_start,
                    reasonEnd: entry.reason_end,
                    shuffle: entry.shuffle,
                    skipped: entry.skipped,
                    offline: entry.offline,
                    offlineTimestamp: unixTimestampToIso(entry.offline_timestamp),
                    incognitoMode: entry.incognito_mode,
                }),
            },
        };
    }

    private buildAudio(entry: SpotifyStreamingHistoryEntry, content: SpotifyContent): ASObject {
        const base = {
            '@type': 'Audio',
            stableKeys: [this.activityStableKeyService.createASObjectStableKey('Audio', { identifier: content.uri })],
            identifier: content.uri,
        };

        switch (content.type) {
            case 'track':
                return {
                    ...base,
                    '@secondaryTypes': [createUnknownASType('MusicRecording'), createUnknownASType('SpotifyTrack')],
                    ...definedProperties({
                        name: entry.master_metadata_track_name,
                        byArtist: entry.master_metadata_album_artist_name,
                        inAlbum: entry.master_metadata_album_album_name,
                    }),
                } as ASObject;
            case 'episode':
                return {
                    ...base,
                    '@secondaryTypes': [createUnknownASType('PodcastEpisode'), createUnknownASType('SpotifyEpisode')],
                    ...definedProperties({ name: entry.episode_name, showName: entry.episode_show_name }),
                } as ASObject;
            case 'audiobookChapter':
                return {
                    ...base,
                    '@secondaryTypes': [
                        createUnknownASType('AudiobookChapter'),
                        createUnknownASType('SpotifyAudiobookChapter'),
                    ],
                    ...definedProperties({
                        name: entry.audiobook_chapter_title,
                        audiobookTitle: entry.audiobook_title,
                        audiobookIdentifier: entry.audiobook_uri,
                    }),
                } as ASObject;
        }
    }

    private buildVideo(entry: SpotifyStreamingHistoryEntry, content: SpotifyContent): ASObject {
        // Its own node, not the audio track: a music video or video podcast is a different medium of the same URI.
        return {
            '@type': 'Video',
            '@secondaryTypes': [createUnknownASType('SpotifyVideo')],
            stableKeys: [this.activityStableKeyService.createASObjectStableKey('Video', { identifier: content.uri })],
            identifier: content.uri,
            contentType: content.type,
            ...definedProperties(
                content.type === 'track'
                    ? {
                          name: entry.master_metadata_track_name,
                          byArtist: entry.master_metadata_album_artist_name,
                          inAlbum: entry.master_metadata_album_album_name,
                      }
                    : content.type === 'episode'
                      ? { name: entry.episode_name, showName: entry.episode_show_name }
                      : { name: entry.audiobook_chapter_title },
            ),
        } as unknown as ASObject;
    }
}

function getContent(entry: SpotifyStreamingHistoryEntry): SpotifyContent | undefined {
    if (entry.spotify_track_uri) {
        return { type: 'track', uri: entry.spotify_track_uri };
    }

    if (entry.spotify_episode_uri) {
        return { type: 'episode', uri: entry.spotify_episode_uri };
    }

    if (entry.audiobook_chapter_uri) {
        return { type: 'audiobookChapter', uri: entry.audiobook_chapter_uri };
    }

    return undefined;
}

function summarize(
    entry: SpotifyStreamingHistoryEntry,
    content: SpotifyContent,
    msPlayed: number,
    isVideo: boolean,
): string {
    const minutes = msPlayed / 60_000;
    const [typeName, name] =
        content.type === 'track'
            ? [isVideo ? 'video of song' : 'song', entry.master_metadata_track_name]
            : content.type === 'episode'
              ? [isVideo ? 'video podcast episode' : 'podcast episode', entry.episode_name]
              : ['audiobook chapter', entry.audiobook_chapter_title];

    return `${isVideo ? 'Watched' : 'Listened to'} ${typeName} "${name ?? content.uri}" for ${minutes.toFixed(1)} minute${
        minutes.toFixed(1) === '1.0' ? '' : 's'
    }`;
}

/** Spotify writes Unix seconds; some older exports use milliseconds. */
function unixTimestampToIso(value: number | null | undefined): string | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return undefined;
    }

    const millis = value > 1e11 ? value : value * 1000;

    return DateTime.fromMillis(millis, { zone: 'utc' }).toISO() ?? undefined;
}

function definedProperties<T extends Record<string, unknown>>(properties: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ) as Partial<T>;
}

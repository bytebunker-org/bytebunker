import { Items, Optional, Required } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import type { ASObject, Audio, Listen } from '@bytebunker/event-schema';
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
import { parseSpotifyStreamingHistory, type SpotifyPlay } from '../util/spotify-streaming-history.parser.js';
import type { SpotifyListenActivityInterface, SpotifyMediaType } from '../type/spotify-listen-activity.interface.js';

const PROGRESS_INTERVAL = 5000;

@PipelineModuleJsonSchema()
export class TransformSpotifyStreamingHistoryInput {
    /** A `Streaming_History_Audio_*.json` or `Streaming_History_Video_*.json` file. */
    @Required()
    public streamingHistoryFile!: AssetDto;

    /** `audio` or `video`. Defaults to `video` for files named `*Video*`, otherwise `audio`. */
    @Optional()
    public mediaType?: string;
}

@PipelineModuleJsonSchema()
export class TransformSpotifyStreamingHistoryOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Turns a Spotify Extended Streaming History file into one Listen activity per play: tracks, podcast episodes,
 * audiobook chapters, and the music videos / video podcasts of the video history. Rows that cannot be read are
 * skipped and counted; the file never fails because of one row.
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
        if (sample.extension !== 'json' || !/^\uFEFF?\s*\[\s*{/.test(sample.head)) {
            return undefined;
        }

        // Extended history rows; the short "Account data" history (StreamingHistory_music_0.json) uses
        // endTime/msPlayed instead and is not supported.
        const isExtendedHistory =
            /"ts"\s*:/.test(sample.head) &&
            /"ms_played"\s*:/.test(sample.head) &&
            /"(spotify_track_uri|spotify_episode_uri|audiobook_uri)"\s*:/.test(sample.head);

        if (!isExtendedHistory) {
            return undefined;
        }

        const isVideo = /video/i.test(sample.fileName);

        return {
            confidence: /streaming_history_(audio|video)/i.test(sample.fileName) ? 0.98 : 0.9,
            format: `Spotify Extended Streaming History (${isVideo ? 'video' : 'audio'})`,
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
        const fileName = inputData.streamingHistoryFile.originalFilename ?? '';
        const mediaType = resolveMediaType(inputData.mediaType, fileName);

        progress.message(`Reading ${fileName || 'streaming history'}`);
        const json = await this.assetService.getAssetString(em, inputData.streamingHistoryFile);

        return {
            activities: this.transformStreamingHistory(json, mediaType, generatorExtensionObject, actorId, progress),
        };
    }

    public transformStreamingHistory(
        json: string,
        mediaType: SpotifyMediaType,
        generatorExtensionObject: ASObject,
        actorId: string,
        progress?: PipelineModuleExecutionContext<unknown>['progress'],
    ): ActivityDto[] {
        const { plays, rowCount, skipped, duplicateRows } = parseSpotifyStreamingHistory(json);
        const activities: ActivityDto[] = [];

        progress?.report({ current: 0, total: plays.length, unit: 'plays', message: `Found ${rowCount} rows` });

        for (const play of plays) {
            activities.push(this.buildListenActivity(play, mediaType, generatorExtensionObject, actorId) as never);

            if (activities.length % PROGRESS_INTERVAL === 0) {
                progress?.report({ current: activities.length, total: plays.length, unit: 'plays' });
            }
        }

        progress?.report({ current: activities.length, total: plays.length, unit: 'plays' });

        const skippedSummary = Object.entries(skipped)
            .map(([reason, count]) => `${count} ${reason}`)
            .join(', ');
        const summary =
            `Read ${rowCount} ${mediaType} rows: ${activities.length} plays, ${duplicateRows} repeated rows dropped` +
            (skippedSummary ? `, skipped ${skippedSummary}` : '');

        if (skippedSummary) {
            this.logger.warn(summary);
        } else {
            this.logger.log(summary);
        }

        progress?.message(summary);

        return activities;
    }

    public buildListenActivity(
        play: SpotifyPlay,
        mediaType: SpotifyMediaType,
        generatorExtensionObject: ASObject,
        actorId: string,
    ): Listen & SpotifyListenActivityInterface {
        const object = this.buildObject(play);

        return {
            '@type': 'Listen',
            '@secondaryTypes': [createUnknownASType('SpotifyListenActivity')],
            generator: generatorExtensionObject,
            stableKeys: [play.playKey],
            actor: {
                '@id': actorId,
                '@type': 'Person',
            },
            summary: summarize(play, mediaType),
            startTime: play.startTime,
            endTime: play.endTime,
            ...(object ? { object } : {}),
            mediaType,
            msPlayed: play.msPlayed,
            ...pick(play, [
                'platform',
                'connCountry',
                'reasonStart',
                'reasonEnd',
                'shuffle',
                'skipped',
                'offline',
                'offlineTimestamp',
                'incognitoMode',
            ]),
        } satisfies Listen & SpotifyListenActivityInterface;
    }

    /**
     * One node per Spotify URI, keyed like the former script importer (`Audio` + `identifier`) so plays imported
     * by it link to the same nodes. `byArtist` is a plain string, as for YouTube Music listens.
     */
    private buildObject(play: SpotifyPlay): Audio | undefined {
        if (!play.uri) {
            return undefined;
        }

        const base = {
            '@type': 'Audio' as const,
            stableKeys: [this.activityStableKeyService.createASObjectStableKey('Audio', { identifier: play.uri })],
            identifier: play.uri,
        };

        switch (play.kind) {
            case 'track':
                return {
                    ...base,
                    '@secondaryTypes': [createUnknownASType('MusicRecording'), createUnknownASType('SpotifyTrack')],
                    name: play.trackName ?? play.uri,
                    ...(play.artistName ? { byArtist: play.artistName } : {}),
                    ...(play.albumName ? { inAlbum: play.albumName } : {}),
                } as Audio;
            case 'episode':
                return {
                    ...base,
                    '@secondaryTypes': [createUnknownASType('PodcastEpisode'), createUnknownASType('SpotifyEpisode')],
                    name: play.episodeName ?? play.uri,
                    ...(play.showName ? { showName: play.showName } : {}),
                } as Audio;
            default:
                return {
                    ...base,
                    '@secondaryTypes': [createUnknownASType('AudiobookChapter')],
                    name: play.audiobookChapterTitle ?? play.audiobookTitle ?? play.uri,
                    ...(play.audiobookTitle ? { audiobookTitle: play.audiobookTitle } : {}),
                    ...(play.audiobookUri ? { audiobookUri: play.audiobookUri } : {}),
                } as Audio;
        }
    }
}

export function resolveMediaType(configured: string | undefined, fileName: string): SpotifyMediaType {
    if (configured === 'audio' || configured === 'video') {
        return configured;
    }

    return /video/i.test(fileName) ? 'video' : 'audio';
}

function summarize(play: SpotifyPlay, mediaType: SpotifyMediaType): string {
    const verb = mediaType === 'video' ? 'Watched' : 'Listened to';

    switch (play.kind) {
        case 'track':
            return `${verb} "${play.trackName ?? play.uri}"${play.artistName ? ` by ${play.artistName}` : ''}`;
        case 'episode':
            return `${verb} "${play.episodeName ?? play.uri}"${play.showName ? ` (${play.showName})` : ''}`;
        case 'audiobook':
            return `${verb} audiobook "${play.audiobookTitle ?? play.uri}"${
                play.audiobookChapterTitle && play.audiobookChapterTitle !== play.audiobookTitle
                    ? `: ${play.audiobookChapterTitle}`
                    : ''
            }`;
        default:
            return `${verb} an unknown item on Spotify`;
    }
}

function pick<T extends object, K extends keyof T>(source: T, keys: K[]): Partial<Pick<T, K>> {
    const result: Partial<Pick<T, K>> = {};

    for (const key of keys) {
        if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }

    return result;
}

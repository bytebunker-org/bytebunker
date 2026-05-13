import { Items, Required } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ASObject, Audio, Listen, View } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import { type YouTubeWatchEntry, YouTubeProductEnum } from '@bytebunker/event-schema/extension/youtube';
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
import { YOUTUBE_EXTENSION, YOUTUBE_EXTENSION_ID } from '../../local-extension.constant.js';
import { parseYouTubeWatchHistory } from '../util/youtube-watch-history.parser.js';
import type { YouTubeViewActivityInterface } from '../type/youtube-view-activity.interface.js';
import type { YouTubeVideoObjectInterface } from '../type/youtube-video-object.interface.js';

@PipelineModuleJsonSchema()
export class TransformYouTubeWatchHistoryInput {
    @Required()
    public rawHtml!: AssetDto;
}

@PipelineModuleJsonSchema()
export class TransformYouTubeWatchHistoryOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

@PipelineModule({
    extensionName: YOUTUBE_EXTENSION,
    inputType: TransformYouTubeWatchHistoryInput,
    outputType: TransformYouTubeWatchHistoryOutput,
})
export class TransformYouTubeWatchHistoryPipelineModule
    implements IPipelineModule<TransformYouTubeWatchHistoryInput, TransformYouTubeWatchHistoryOutput>
{
    private readonly logger = new Logger(TransformYouTubeWatchHistoryPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public async executeModule({
        em,
        inputData,
    }: PipelineModuleExecutionContext<TransformYouTubeWatchHistoryInput>): Promise<TransformYouTubeWatchHistoryOutput> {
        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(em, YOUTUBE_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;

        const rawHtml = await this.assetService.getAssetString(em, inputData.rawHtml);
        const entries = parseYouTubeWatchHistory(rawHtml, this.logger);

        this.logger.log(`Parsed ${entries.length} YouTube watch history entries`);

        const activities: ActivityDto[] = [];

        for (const entry of entries) {
            const watchedAt = DateTime.fromISO(entry.watchedAt, { setZone: true });

            if (!watchedAt.isValid) {
                continue;
            }

            const activity =
                entry.product === YouTubeProductEnum.YOUTUBE_MUSIC
                    ? this.buildListenActivity(entry, watchedAt, generatorExtensionObject, actorId)
                    : this.buildViewActivity(entry, watchedAt, generatorExtensionObject, actorId);

            activities.push(activity as unknown as ActivityDto);
        }

        return { activities };
    }

    private buildViewActivity(
        entry: YouTubeWatchEntry,
        watchedAt: DateTime<true>,
        generatorExtensionObject: ASObject,
        actorId: string,
    ): View & YouTubeViewActivityInterface {
        const videoObject: Audio & YouTubeVideoObjectInterface = {
            '@type': 'Video' as Audio['@type'],
            '@secondaryTypes': [createUnknownASType('YouTubeVideo')],
            stableKeys: [
                this.activityStableKeyService.createASObjectStableKey('Video', {
                    videoId: entry.videoId,
                }),
            ],
            name: entry.title,
            videoId: entry.videoId,
            videoUrl: entry.videoUrl,
            ...(entry.channelName ? { channelName: entry.channelName } : {}),
            ...(entry.channelId ? { channelId: entry.channelId } : {}),
            ...(entry.channelUrl ? { channelUrl: entry.channelUrl } : {}),
        } as Audio & YouTubeVideoObjectInterface;

        return {
            '@type': 'View',
            '@secondaryTypes': [createUnknownASType('YouTubeViewActivity')],
            generator: generatorExtensionObject,
            stableKeys: [
                this.activityStableKeyService.createActivityStableKey(
                    'View',
                    { start: watchedAt, videoId: entry.videoId },
                    { dateTimePrecision: 'minute' },
                ),
            ],
            actor: {
                '@id': actorId,
                '@type': 'Person',
            },
            startTime: watchedAt,
            product: entry.product,
            object: videoObject,
        } satisfies View & YouTubeViewActivityInterface;
    }

    private buildListenActivity(
        entry: YouTubeWatchEntry,
        watchedAt: DateTime<true>,
        generatorExtensionObject: ASObject,
        actorId: string,
    ): Listen {
        const identifier = `youtube:track:${entry.videoId}`;

        const audioObject: Audio = {
            '@type': 'Audio',
            '@secondaryTypes': [createUnknownASType('MusicRecording')],
            stableKeys: [
                this.activityStableKeyService.createASObjectStableKey('Audio', {
                    identifier,
                }),
            ],
            name: entry.title,
            ...(entry.channelName ? { byArtist: stripTopicSuffix(entry.channelName) } : {}),
            identifier,
        } as Audio;

        return {
            '@type': 'Listen',
            generator: generatorExtensionObject,
            stableKeys: [
                this.activityStableKeyService.createActivityStableKey(
                    'Listen',
                    { start: watchedAt, videoId: entry.videoId },
                    { dateTimePrecision: 'minute' },
                ),
            ],
            actor: {
                '@id': actorId,
                '@type': 'Person',
            },
            startTime: watchedAt,
            object: audioObject,
        } satisfies Listen;
    }
}

/**
 * YouTube Music auto-generated artist channels are named like `NERO - Topic` — the artist is the
 * portion before the suffix. Channels without that suffix are user-uploaded; return as-is.
 */
function stripTopicSuffix(channelName: string): string {
    return channelName.replace(/\s*-\s*Topic\s*$/, '').trim() || channelName;
}

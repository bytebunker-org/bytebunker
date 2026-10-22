import { Items, Optional, Required } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ASObject } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import type {
    AirbnbMessage,
    AirbnbMessageThread,
    AirbnbReservation,
    AirbnbReview,
    AirbnbSearch,
} from '@bytebunker/event-schema/extension/airbnb';
import { AirbnbExportFileKindEnum } from '@bytebunker/event-schema/extension/airbnb';
import { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { personStableKeys } from '../../../../activity-graph/util/person-stable-key.util.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import type { FileDetection, FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import { AIRBNB_EXTENSION, AIRBNB_EXTENSION_ID } from '../../local-extension.constant.js';
import {
    AIRBNB_KIND_LABEL,
    detectAirbnbDocumentKind,
    detectAirbnbHeadKind,
    detectOwnerAccountId,
} from '../util/airbnb-export-kind.util.js';

/** The export carries no listing timezone; stays are anchored to the user's home zone unless configured. */
const DEFAULT_STAY_TIMEZONE = 'Europe/Berlin';
const SEARCH_TIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';
const AIRBNB_PROFILE_URL = 'https://www.airbnb.com/users/show/';
const AIRBNB_SERVICE_ID = 'service';

export interface TransformAirbnbExportOptions {
    timezone?: string;
    includeCancelled?: boolean;
    ownerAccountId?: string;
}

interface BuildContext {
    generator: ASObject;
    actorId: string;
    options: TransformAirbnbExportOptions;
}

/** Counts of what was skipped and why, logged once per file. */
type SkipCounts = Record<string, number>;

@PipelineModuleJsonSchema()
export class TransformAirbnbExportInput {
    /** Any file from the export's `json/` folder. Files without importable data produce no activities. */
    @Required()
    public airbnbFile!: AssetDto;

    /**
     * IANA zone in which a stay's check-in date starts at midnight. The export has no listing timezone, so this is the
     * zone of the user's trips. Defaults to Europe/Berlin.
     */
    @Optional()
    public timezone?: string;

    /** Import cancelled reservations too (status "cancelled"). Defaults to false. */
    @Optional()
    public includeCancelled?: boolean;

    /**
     * Airbnb account id of the exporting user. Detected as the account present in every message thread; only needed
     * when that is ambiguous (for example an export with a single thread).
     */
    @Optional()
    public ownerAccountId?: string;
}

@PipelineModuleJsonSchema()
export class TransformAirbnbExportOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Turns one file of the Airbnb personal data export (`json/*.json`) into activities, detecting the kind by its
 * top-level keys: reservations → Event+Stay, search_history → Search, messages → Create+Message, reviews →
 * Create+Review. Other files (payments, profile, wishlists, telemetry, ...) yield no activities, so a glob over the
 * whole folder or a dropped zip works.
 */
@PipelineModule({
    extensionName: AIRBNB_EXTENSION,
    inputType: TransformAirbnbExportInput,
    outputType: TransformAirbnbExportOutput,
})
export class TransformAirbnbExportPipelineModule
    implements IPipelineModule<TransformAirbnbExportInput, TransformAirbnbExportOutput>
{
    private readonly logger = new Logger(TransformAirbnbExportPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public detectFile(sample: FileSample): FileDetection | undefined {
        if (sample.extension !== 'json') {
            return undefined;
        }

        const kind = detectAirbnbHeadKind(sample.head);
        if (kind === AirbnbExportFileKindEnum.UNSUPPORTED) {
            return undefined;
        }

        return { confidence: 0.9, format: `Airbnb data export (${AIRBNB_KIND_LABEL[kind]})` };
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<TransformAirbnbExportInput>): Promise<TransformAirbnbExportOutput> {
        const generator = await this.activityGraphNodeService.getExtension(em, AIRBNB_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;

        const fileName = inputData.airbnbFile.originalFilename ?? 'Airbnb export file';
        progress.message(`Reading ${fileName}`);
        const raw = await this.assetService.getAssetString(em, inputData.airbnbFile);
        progress.message('Parsing JSON');
        const activities = this.transformExport(JSON.parse(raw) as unknown, generator, actorId, inputData, fileName);

        progress.report({
            current: activities.length,
            total: activities.length,
            unit: 'activities',
            message: `Built ${activities.length} activities`,
        });

        return { activities };
    }

    public transformExport(
        parsed: unknown,
        generator: ASObject,
        actorId: string,
        options: TransformAirbnbExportOptions = {},
        fileName = 'file',
    ): ActivityDto[] {
        const context: BuildContext = { generator, actorId, options };
        const documents = Array.isArray(parsed) ? parsed : [parsed];
        const activities: ActivityDto[] = [];
        let handled = false;

        for (const document of documents) {
            const kind = detectAirbnbDocumentKind(document);
            const skipped: SkipCounts = {};
            let built: object[] = [];

            switch (kind) {
                case AirbnbExportFileKindEnum.RESERVATIONS:
                    built = this.buildStays(document as { reservations?: AirbnbReservation[] }, context, skipped);
                    break;
                case AirbnbExportFileKindEnum.SEARCH_HISTORY:
                    built = this.buildSearches(document as { servicedata?: AirbnbSearch[] }, context, skipped);
                    break;
                case AirbnbExportFileKindEnum.MESSAGES:
                    built = this.buildMessages(
                        document as { messageThreads?: AirbnbMessageThread[] },
                        context,
                        skipped,
                    );
                    break;
                case AirbnbExportFileKindEnum.REVIEWS:
                    built = this.buildReviews(
                        document as { reviewsReceived?: AirbnbReview[]; reviewsWritten?: AirbnbReview[] },
                        context,
                        skipped,
                    );
                    break;
                default:
                    continue;
            }

            handled = true;
            this.logger.log(
                `${fileName}: ${AIRBNB_KIND_LABEL[kind]} → ${built.length} activities` +
                    (Object.keys(skipped).length ? `, skipped ${JSON.stringify(skipped)}` : ''),
            );
            activities.push(...(built as unknown as ActivityDto[]));
        }

        if (!handled) {
            const keys = documents
                .flatMap((document) => (document && typeof document === 'object' ? Object.keys(document) : []))
                .slice(0, 8);
            this.logger.log(
                `${fileName}: not an importable Airbnb file (top-level keys: ${keys.join(', ') || 'none'}), skipped`,
            );
        }

        return activities;
    }

    // ---- reservations --------------------------------------------------------------------------------------------

    private buildStays(
        document: { reservations?: AirbnbReservation[] },
        { generator, actorId, options }: BuildContext,
        skipped: SkipCounts,
    ): object[] {
        let zone = options.timezone ?? DEFAULT_STAY_TIMEZONE;
        if (!DateTime.local().setZone(zone).isValid) {
            this.logger.warn(`Unknown timezone "${zone}", using ${DEFAULT_STAY_TIMEZONE}`);
            zone = DEFAULT_STAY_TIMEZONE;
        }

        const stays: object[] = [];

        for (const reservation of document.reservations ?? []) {
            const status = reservation.status?.toLowerCase();
            if (status !== 'accepted' && !(options.includeCancelled && status === 'cancelled')) {
                count(skipped, `status:${status ?? 'none'}`);
                continue;
            }

            const startTime = DateTime.fromISO(reservation.startDate ?? '', { zone });
            if (!reservation.confirmationCode || !startTime.isValid) {
                count(skipped, 'invalid');
                continue;
            }

            const nights = Number(reservation.nights) || 0;
            const listingId = /\/rooms\/(\d+)/.exec(reservation.hostingUrl ?? '')?.[1];
            const location = listingId ? this.buildListing(listingId, reservation.hostingUrl!) : undefined;

            stays.push({
                '@type': 'Event',
                '@secondaryTypes': [createUnknownASType('Stay')],
                generator,
                stableKeys: [`airbnb:reservation:${reservation.confirmationCode}`],
                actor: { '@id': actorId, '@type': 'Person' },
                summary: `Airbnb stay (${nights} ${nights === 1 ? 'night' : 'nights'})`,
                startTime,
                endTime: startTime.plus({ days: nights }),
                allDay: true,
                ...(location ? { location } : {}),
                status,
                nights,
                ...optional('guests', reservation.numberOfGuests),
                confirmationCode: reservation.confirmationCode,
                ...optional('bookedAt', reservation.createdAt),
                ...optional('canceledAt', reservation.canceledAt),
                ...optional('checkinFromHour', reservation.guestCheckinTimeFrom),
                ...optional('checkinToHour', reservation.guestCheckinTimeTo),
                ...optional('guestMessage', reservation.message || undefined),
                ...optional('hostProfileUrl', reservation.hostProfileUrl),
                ...optional('listingUrl', reservation.hostingUrl),
                ...optional('listingId', listingId),
            });
        }

        return stays;
    }

    private buildListing(listingId: string, listingUrl: string): object {
        const identifier = `airbnb:listing:${listingId}`;

        return {
            '@type': 'Place',
            '@secondaryTypes': [createUnknownASType('AirbnbListing')],
            stableKeys: [this.activityStableKeyService.createASObjectStableKey('Place', { identifier })],
            name: `Airbnb listing ${listingId}`,
            identifier,
            listingUrl,
        };
    }

    // ---- search history ------------------------------------------------------------------------------------------

    private buildSearches(
        document: { servicedata?: AirbnbSearch[] },
        { generator, actorId }: BuildContext,
        skipped: SkipCounts,
    ): object[] {
        const searches: object[] = [];

        for (const search of document.servicedata ?? []) {
            // The export writes search times in GMT.
            const startTime = DateTime.fromFormat(search.timeofsearch ?? '', SEARCH_TIME_FORMAT, { zone: 'utc' });
            const query = search.rawlocation?.trim() || search.city?.trim();
            if (!startTime.isValid || !query) {
                count(skipped, startTime.isValid ? 'no-location' : 'invalid');
                continue;
            }

            const hasCoordinates =
                typeof search.searchlocationlatitude === 'number' && typeof search.searchlocationlongitude === 'number';
            const summary = [search.city, search.state, search.country].filter(Boolean).join(', ');
            const location = {
                '@type': 'Place',
                stableKeys: [
                    this.activityStableKeyService.createASObjectStableKey('Place', {
                        name: query,
                        ...(hasCoordinates
                            ? { lat: search.searchlocationlatitude, lng: search.searchlocationlongitude }
                            : {}),
                    }),
                ],
                name: query,
                ...(hasCoordinates
                    ? { latitude: search.searchlocationlatitude, longitude: search.searchlocationlongitude }
                    : {}),
                ...(summary ? { summary } : {}),
            };

            searches.push({
                '@type': createUnknownASType('Search'),
                generator,
                stableKeys: [`airbnb:search:${startTime.toISO()}:${search.rawlocation ?? ''}`],
                actor: { '@id': actorId, '@type': 'Person' },
                startTime,
                query,
                location,
                ...optional('checkIn', search.checkindate),
                ...optional('checkOut', search.checkoutdate),
                ...optional('nights', search.numberofnights),
                ...optional('guests', search.numberofguests),
            });
        }

        return searches;
    }

    // ---- messages ------------------------------------------------------------------------------------------------

    private buildMessages(
        document: { messageThreads?: AirbnbMessageThread[] },
        { generator, actorId, options }: BuildContext,
        skipped: SkipCounts,
    ): object[] {
        const threads = document.messageThreads ?? [];
        const participantIdsByThread = threads.map((thread) => ({
            thread,
            participantIds: (thread.messageThreadParticipants ?? [])
                .map((participant) => participantId(participant.accountId))
                .filter((id): id is string => id !== undefined),
        }));

        const ownerId = options.ownerAccountId?.trim() || detectOwnerAccountId(participantIdsByThread);
        if (!ownerId && threads.some((thread) => thread.messagesAndContents?.length)) {
            this.logger.warn(
                'Could not tell which Airbnb account is yours (no single account in every thread); set ownerAccountId. ' +
                    'Messages are imported without direction and target.',
            );
        }

        const owner: ASObject = { '@id': actorId, '@type': 'Person' };
        const personFor = (id: string | undefined): ASObject =>
            id !== undefined && id === ownerId ? owner : person(id);
        const messages: object[] = [];

        for (const { thread } of participantIdsByThread) {
            const others = unique(
                (thread.messageThreadParticipants ?? []).map((participant) => participantId(participant.accountId)),
            ).filter((id) => id !== ownerId);

            for (const entry of thread.messagesAndContents ?? []) {
                const message = entry.message;
                const startTime = DateTime.fromISO(message?.createdAt ?? '', { setZone: true });
                if (message?.id === undefined || !startTime.isValid) {
                    count(skipped, 'invalid');
                    continue;
                }

                const content = messageText(entry);
                if (content === undefined) {
                    count(skipped, message.contentType ?? 'no-content');
                    continue;
                }

                const senderId = message.accountId === undefined ? undefined : String(message.accountId);
                const isOutgoing = ownerId !== undefined && senderId === ownerId;
                let target: ASObject | undefined;
                if (ownerId !== undefined) {
                    target = isOutgoing ? (others.length === 1 ? person(others[0]) : undefined) : owner;
                }
                const reference = entry.messageContent?.textAndReferenceContent;

                messages.push({
                    '@type': 'Create',
                    '@secondaryTypes': [createUnknownASType('Message')],
                    generator,
                    stableKeys: [`airbnb:message:${message.id}`],
                    actor: personFor(senderId),
                    ...(target ? { target } : {}),
                    startTime,
                    object: { '@type': 'Note', content },
                    conversationId: `airbnb:thread:${thread.id}`,
                    ...(ownerId === undefined ? {} : { direction: isOutgoing ? 'outgoing' : 'incoming' }),
                    ...optional('contentType', message.contentType),
                    ...optional('referenceType', reference?.referenceType),
                    ...optional('referenceId', reference?.referenceId),
                });
            }
        }

        return messages;
    }

    // ---- reviews -------------------------------------------------------------------------------------------------

    private buildReviews(
        document: { reviewsReceived?: AirbnbReview[]; reviewsWritten?: AirbnbReview[] },
        { generator, actorId, options }: BuildContext,
        skipped: SkipCounts,
    ): object[] {
        const owner: ASObject = { '@id': actorId, '@type': 'Person' };
        const reviews: object[] = [];

        // Received reviews are about the exporting user, written ones are by them.
        const groups: { items: AirbnbReview[]; ownerRole: 'reviewee' | 'reviewer' }[] = [
            { items: document.reviewsReceived ?? [], ownerRole: 'reviewee' },
            { items: document.reviewsWritten ?? [], ownerRole: 'reviewer' },
        ];

        for (const { items, ownerRole } of groups) {
            const ownerId = options.ownerAccountId?.trim() || undefined;

            for (const { review, reviewCategoryRatings } of items) {
                const startTime = DateTime.fromISO(review?.submittedAt ?? review?.createdAt ?? '', { setZone: true });
                if (review?.reviewId === undefined || !startTime.isValid) {
                    count(skipped, 'invalid');
                    continue;
                }

                const reviewerId = participantId(review.reviewerId);
                const revieweeId = participantId(review.revieweeId);
                const reviewerIsOwner = ownerRole === 'reviewer' || (ownerId !== undefined && reviewerId === ownerId);
                const revieweeIsOwner = ownerRole === 'reviewee' || (ownerId !== undefined && revieweeId === ownerId);

                reviews.push({
                    '@type': 'Create',
                    '@secondaryTypes': [createUnknownASType('Review')],
                    generator,
                    stableKeys: [`airbnb:review:${review.reviewId}`],
                    actor: reviewerIsOwner ? owner : person(reviewerId),
                    target: revieweeIsOwner ? owner : person(revieweeId),
                    startTime,
                    object: { '@type': 'Note', content: review.comment ?? '' },
                    ...optional('rating', review.rating),
                    ...(reviewCategoryRatings?.length ? { categoryRatings: reviewCategoryRatings } : {}),
                    ...optional('recommended', review.isEntityRecommended),
                    ...optional('reviewerRole', review.reviewerRole),
                    ...optional('revieweeRole', review.revieweeRole),
                    ...optional('language', review.commentLanguage),
                });
            }
        }

        return reviews;
    }
}

/** Another Airbnb account as a Person that links to my-hub persons through its handle. */
function person(accountId: string | undefined): ASObject {
    const id = accountId ?? AIRBNB_SERVICE_ID;

    return {
        '@type': 'Person',
        stableKeys: personStableKeys({ handles: [{ platform: 'airbnb', id }] }),
        ...(id === AIRBNB_SERVICE_ID ? { name: 'Airbnb' } : { profileUrl: `${AIRBNB_PROFILE_URL}${id}` }),
    } as ASObject;
}

function participantId(accountId: number | string | undefined | null): string | undefined {
    return accountId === undefined || accountId === null ? undefined : String(accountId);
}

/** Text to store for a message, or undefined for technical entries that carry nothing. */
function messageText(entry: AirbnbMessage): string | undefined {
    const content = entry.messageContent;
    const text =
        content?.textContent?.body ?? content?.textAndReferenceContent?.text ?? content?.messageContentV2?.content;

    if (text?.trim()) return text;
    if (content?.eventDescriptionContent?.eventType) return `[${content.eventDescriptionContent.eventType}]`;
    // A booking card without text still ties the thread to a reservation (referenceId).
    if (content?.textAndReferenceContent?.referenceType) return `[${content.textAndReferenceContent.referenceType}]`;
    if (entry.message?.contentType === 'FinishAssetUploadContent') return '[attachment]';

    return undefined;
}

function optional<K extends string>(key: K, value: unknown): Partial<Record<K, unknown>> {
    return value === undefined || value === null ? {} : ({ [key]: value } as Record<K, unknown>);
}

function count(counts: SkipCounts, reason: string): void {
    counts[reason] = (counts[reason] ?? 0) + 1;
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}

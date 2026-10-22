import { createHash } from 'node:crypto';
import { Optional, Required, Items } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ASObject, Person } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import type { WhatsAppMessageModel } from '@bytebunker/event-schema/extension/whatsapp';
import { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
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
import { WHATSAPP_EXTENSION, WHATSAPP_EXTENSION_ID } from '../../local-extension.constant.js';
import { looksLikeWhatsAppChat, parseWhatsAppChat } from '../util/whatsapp-chat.parser.js';
import type { WhatsAppMessageActivityInterface } from '../type/whatsapp-message-activity.interface.js';

const DEFAULT_TIMEZONE = 'Europe/Berlin';
const WHATSAPP_NAME_PLATFORM = 'whatsapp-name';
const FILE_NAME_PATTERN = /^whatsapp[ -]?chat(?: with| mit| -)? ?(.*?)(?:\.txt)?$/i;
const PHONE_NUMBER_NAME = /^\+[\d\s().-]{7,}$/;

export interface ParseWhatsAppChatOptions {
    timezone?: string;
    ownerName?: string;
    chatName?: string;
    /** Name of the owner actor node, used to find the owner among the senders when `ownerName` is not set. */
    ownerActorName?: string;
    /** Original file name, source of the default chat name and, for two senders, of the partner. */
    fileName?: string;
}

export interface ParseWhatsAppChatResult {
    activities: ActivityDto[];
    chatName: string;
    ownerName: string;
    isGroup: boolean;
    skipped: { system: number; calls: number; badLines: number };
}

@PipelineModuleJsonSchema()
export class ParseWhatsappChatInput {
    /** The `WhatsApp Chat with <name>.txt` file (or iOS `_chat.txt`) from "Export chat". Zips are unpacked beforehand. */
    @Required()
    public chatFile!: AssetDto;

    /**
     * IANA zone the phone was in. WhatsApp writes device-local wall time without an offset. Defaults to
     * Europe/Berlin.
     */
    @Optional()
    public timezone?: string;

    /**
     * The owner's display name as it appears in the export. Defaults to the owner account's name if that is one of
     * the senders; for a chat with two senders the one not named in the file name is the owner. Required for
     * groups when the owner account's name does not match.
     */
    @Optional()
    public ownerName?: string;

    /** Name of the chat or group. Defaults to the name in the file name (`WhatsApp Chat with <name>.txt`). */
    @Optional()
    public chatName?: string;
}

@PipelineModuleJsonSchema()
export class ParseWhatsappChatOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Imports a WhatsApp "Export chat" text file as one `Create` + `Message` activity per message: sender Person as
 * actor, the other participant as target (1:1 chats only), a `Note` with the text as object. System lines
 * (encryption notice, security code changes, "X is a contact", missed calls) are skipped and counted. Messages
 * with media keep an empty body and the attachment file name when the export names it.
 */
@PipelineModule({
    extensionName: WHATSAPP_EXTENSION,
    inputType: ParseWhatsappChatInput,
    outputType: ParseWhatsappChatOutput,
})
export class ParseWhatsappChatPipelineModule
    implements IPipelineModule<ParseWhatsappChatInput, ParseWhatsappChatOutput>
{
    private readonly logger = new Logger(ParseWhatsappChatPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public detectFile(sample: FileSample): FileDetection | undefined {
        if (sample.extension !== 'txt') {
            return undefined;
        }

        if (looksLikeWhatsAppChat(sample.head)) {
            return { confidence: 0.9, format: 'WhatsApp chat export (.txt)' };
        }

        if (/^whatsapp[ -]?chat/i.test(sample.fileName)) {
            return { confidence: 0.85, format: 'WhatsApp chat export (.txt)' };
        }

        return undefined;
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<ParseWhatsappChatInput>): Promise<ParseWhatsappChatOutput> {
        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(em, WHATSAPP_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;
        const ownerActorName = ownerActor.get('name') as string | undefined;

        progress.message('Reading chat');
        const rawChat = await this.assetService.getAssetString(em, inputData.chatFile);
        progress.message('Parsing messages');

        const result = this.parseChatToActivities(rawChat, generatorExtensionObject, actorId, {
            timezone: inputData.timezone,
            ownerName: inputData.ownerName,
            chatName: inputData.chatName,
            ownerActorName,
            fileName: inputData.chatFile.originalFilename,
        });

        progress.report({ current: result.activities.length, total: result.activities.length, unit: 'messages' });
        this.logger.log(
            `WhatsApp chat "${result.chatName}": ${result.activities.length} messages (owner "${result.ownerName}"` +
                `${result.isGroup ? ', group' : ''}), skipped ${result.skipped.system} system lines, ` +
                `${result.skipped.calls} call notices, ${result.skipped.badLines} unparsable lines`,
        );

        return { activities: result.activities };
    }

    public parseChatToActivities(
        rawChat: string,
        generatorExtensionObject: ASObject,
        actorId: string,
        options: ParseWhatsAppChatOptions = {},
    ): ParseWhatsAppChatResult {
        const zone = options.timezone ?? DEFAULT_TIMEZONE;

        if (!DateTime.local().setZone(zone).isValid) {
            throw new Error(`Unknown timezone "${zone}"`);
        }

        const chat = parseWhatsAppChat(rawChat);
        const chatName = options.chatName?.trim() || chatNameFromFileName(options.fileName) || 'chat';
        const senders = [...new Set(chat.messages.map((message) => message.sender).filter(isDefined))];
        const ownerName = resolveOwnerName(senders, chatName, options);
        const isGroup = senders.filter((name) => name !== ownerName).length > 1;
        const conversationId = `whatsapp:${chatName}`;
        const partnerName_ = senders.find((name) => name !== ownerName);
        // A 1:1 chat where only the owner wrote: the partner is the chat name.
        const partnerName = isGroup ? undefined : (partnerName_ ?? (chatName === ownerName ? undefined : chatName));

        const owner = { '@id': actorId, '@type': 'Person' } as const;
        const personCache = new Map<string, Person>();
        const personFor = (name: string): Person => {
            let person = personCache.get(name);

            if (!person) {
                person = buildPerson(name);
                personCache.set(name, person);
            }

            return person;
        };

        const ordinals = new Map<string, number>();
        const skipped = { system: 0, calls: 0, badLines: chat.skippedLines };
        const activities: ActivityDto[] = [];

        for (const message of chat.messages) {
            if (message.sender === undefined) {
                if (message.kind === 'call') {
                    skipped.calls++;
                } else {
                    skipped.system++;
                }

                continue;
            }

            const startTime = DateTime.fromISO(message.wallTime, { zone });

            if (!startTime.isValid) {
                skipped.badLines++;
                continue;
            }

            const outgoing = message.sender === ownerName;
            const activity = this.buildActivity({
                message,
                startTime,
                generatorExtensionObject,
                actor: outgoing ? owner : personFor(message.sender),
                target: isGroup ? undefined : outgoing ? (partnerName ? personFor(partnerName) : undefined) : owner,
                conversationId,
                chatName,
                isGroup,
                outgoing,
                ordinals,
            });

            activities.push(activity as unknown as ActivityDto);
        }

        return { activities, chatName, ownerName, isGroup, skipped };
    }

    private buildActivity(args: {
        message: WhatsAppMessageModel;
        startTime: DateTime;
        generatorExtensionObject: ASObject;
        actor: ASObject;
        target?: ASObject;
        conversationId: string;
        chatName: string;
        isGroup: boolean;
        outgoing: boolean;
        ordinals: Map<string, number>;
    }): ASObject & WhatsAppMessageActivityInterface {
        const { message, startTime } = args;
        const sender = message.sender!;
        const identity = `${args.chatName}:${startTime.toUTC().toFormat("yyyy-MM-dd'T'HH:mm'Z'")}:${sender}:${contentHash(message)}`;
        const ordinal = (args.ordinals.get(identity) ?? 0) + 1;
        args.ordinals.set(identity, ordinal);

        return {
            '@type': 'Create',
            '@secondaryTypes': [createUnknownASType('Message')],
            generator: args.generatorExtensionObject,
            stableKeys: [`whatsapp:${identity}:${ordinal}`],
            actor: args.actor,
            ...(args.target ? { target: args.target } : {}),
            startTime,
            object: { '@type': 'Note', stableKeys: [`whatsapp:${identity}:${ordinal}:note`], content: message.text },
            conversationId: args.conversationId,
            chatName: args.chatName,
            isGroupChat: args.isGroup,
            direction: args.outgoing ? 'outgoing' : 'incoming',
            messageKind: message.kind,
            edited: message.edited,
            deleted: message.kind === 'deleted',
            ...(message.mediaFileName ? { mediaFileName: message.mediaFileName } : {}),
            ...(message.latitude === undefined
                ? {}
                : { sharedLatitude: message.latitude, sharedLongitude: message.longitude }),
        } as ASObject & WhatsAppMessageActivityInterface;
    }
}

/**
 * Locale-independent content hash: the kind plus the text, so `<Media omitted>` and `<Medien ausgeschlossen>`
 * (or `IMG-….jpg (file attached)`) of the same message hash alike, as does the same message with and without the
 * edited suffix.
 */
function contentHash(message: WhatsAppMessageModel): string {
    return createHash('sha1').update(`${message.kind}\u0000${message.text}`).digest('hex').slice(0, 12);
}

function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}

export function chatNameFromFileName(fileName: string | undefined): string | undefined {
    if (!fileName) {
        return undefined;
    }

    const base = fileName.slice(fileName.lastIndexOf('/') + 1);
    const name = FILE_NAME_PATTERN.exec(base)?.[1]?.trim();

    return name || undefined;
}

function resolveOwnerName(senders: string[], chatName: string, options: ParseWhatsAppChatOptions): string {
    const find = (name: string | undefined): string | undefined =>
        name ? senders.find((sender) => sender.toLowerCase() === name.trim().toLowerCase()) : undefined;

    if (options.ownerName?.trim()) {
        // Trust the option even when that person wrote nothing in this export.
        return find(options.ownerName) ?? options.ownerName.trim();
    }

    const byActorName = find(options.ownerActorName);

    if (byActorName) {
        return byActorName;
    }

    if (senders.length <= 2) {
        const partner = find(chatName);

        if (partner && senders.length === 2) {
            return senders.find((sender) => sender !== partner)!;
        }

        if (senders.length === 1 && !partner) {
            return senders[0];
        }

        if (senders.length === 1) {
            // Only the partner wrote; the owner never appears, so any non-colliding placeholder works.
            return options.ownerActorName ?? 'me';
        }

        if (senders.length === 0) {
            return options.ownerActorName ?? 'me';
        }
    }

    throw new Error(
        `Cannot tell which sender is the owner among ${senders.length} senders; set the "ownerName" option to your name in the export`,
    );
}

function buildPerson(name: string): Person {
    return {
        '@type': 'Person',
        stableKeys: personStableKeys({
            handles: [{ platform: WHATSAPP_NAME_PLATFORM, id: name }],
            phones: PHONE_NUMBER_NAME.test(name) ? [name] : [],
        }),
        name,
    };
}

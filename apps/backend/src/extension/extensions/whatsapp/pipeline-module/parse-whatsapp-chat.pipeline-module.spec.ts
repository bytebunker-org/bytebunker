import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@suites/unit';
import type { Mocked } from '@suites/doubles.vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { ASObject } from '@bytebunker/event-schema';
import { DateTime } from 'luxon';
import {
    ParseWhatsappChatPipelineModule,
    chatNameFromFileName,
    type ParseWhatsAppChatOptions,
} from './parse-whatsapp-chat.pipeline-module.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import type { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import type { WhatsAppMessageActivityInterface } from '../type/whatsapp-message-activity.interface.js';
import {
    ANDROID_US,
    DST_CHAT,
    GROUP_CHAT,
    REPEATED,
    SAME_CHAT_IOS_DE,
    SAME_CHAT_US,
} from '../util/whatsapp-chat.fixture.js';

const FAKE_ACTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const FAKE_GENERATOR: ASObject = { '@id': '00000000-0000-0000-0000-0000000000bb', '@type': 'Application' };
const FILE_NAME = 'WhatsApp Chat with Alice Example.txt';

type Activity = ASObject &
    WhatsAppMessageActivityInterface & {
        startTime: DateTime;
        actor: ASObject;
        target?: ASObject;
        object: ASObject & { content: string };
    };

describe('ParseWhatsappChatPipelineModule', () => {
    let module: ParseWhatsappChatPipelineModule;
    let assetService: Mocked<AssetService>;
    let graphService: Mocked<ActivityGraphService>;
    let graphNodeService: Mocked<ActivityGraphNodeService>;

    beforeEach(async () => {
        const { unit, unitRef } = await TestBed.solitary(ParseWhatsappChatPipelineModule).compile();

        module = unit;
        assetService = unitRef.get(AssetService) as unknown as Mocked<AssetService>;
        graphService = unitRef.get(ActivityGraphService) as unknown as Mocked<ActivityGraphService>;
        graphNodeService = unitRef.get(ActivityGraphNodeService) as unknown as Mocked<ActivityGraphNodeService>;

        void graphNodeService.getExtension.mockResolvedValue(FAKE_GENERATOR);
        void graphService.getOwnerActor.mockResolvedValue({
            get: (key: string) => (key === 'id' ? FAKE_ACTOR_ID : key === 'name' ? 'Bob Sample' : undefined),
        } as never);
    });

    function run(raw: string, options: ParseWhatsAppChatOptions) {
        const result = module.parseChatToActivities(raw, FAKE_GENERATOR, FAKE_ACTOR_ID, options);

        return { ...result, activities: result.activities as unknown as Activity[] };
    }

    describe('parseChatToActivities', () => {
        it('maps a 1:1 chat to Create/Message activities with sender and target', () => {
            const { activities, chatName, ownerName, isGroup, skipped } = run(ANDROID_US, {
                fileName: FILE_NAME,
                ownerName: 'Bob Sample',
            });

            expect(chatName).toBe('Alice Example');
            expect(ownerName).toBe('Bob Sample');
            expect(isGroup).toBe(false);
            expect(skipped).toEqual({ system: 4, calls: 1, badLines: 0 });

            const hello = activities.find((a) => a.object.content === 'Hello there')!;
            expect(hello['@type']).toBe('Create');
            expect(hello['@secondaryTypes']).toEqual(['Message']);
            expect(hello.generator).toBe(FAKE_GENERATOR);
            expect(hello.direction).toBe('incoming');
            expect(hello.conversationId).toBe('whatsapp:Alice Example');
            expect(hello.actor).toMatchObject({
                '@type': 'Person',
                name: 'Alice Example',
                stableKeys: ['person:handle:whatsapp-name:alice example'],
            });
            expect(hello.target).toEqual({ '@id': FAKE_ACTOR_ID, '@type': 'Person' });
            expect(hello.object['@type']).toBe('Note');

            const reply = activities.find((a) => a.object.content.startsWith('Hi Alice'))!;
            expect(reply.direction).toBe('outgoing');
            expect(reply.actor).toEqual({ '@id': FAKE_ACTOR_ID, '@type': 'Person' });
            expect(reply.target).toMatchObject({ name: 'Alice Example' });
        });

        it('keeps media, deleted, edited, location and contact messages with their flags', () => {
            const { activities } = run(ANDROID_US, { fileName: FILE_NAME, ownerName: 'Bob Sample' });
            const kinds = activities.map((a) => a.messageKind);

            expect(kinds).toEqual([
                'text',
                'text',
                'media',
                'deleted',
                'deleted',
                'text',
                'media',
                'location',
                'contact',
                'poll',
            ]);
            expect(activities[2]).toMatchObject({ object: { content: '' }, deleted: false });
            expect(activities[3]).toMatchObject({ deleted: true, object: { content: '' } });
            expect(activities[5]).toMatchObject({ edited: true, object: { content: 'Fixed the typo' } });
            expect(activities[6]).toMatchObject({ mediaFileName: 'IMG-20260113-WA0001.jpg' });
            expect(activities[7]).toMatchObject({ sharedLatitude: 48.137_154, sharedLongitude: 11.576_124 });
        });

        it('converts wall time in the configured zone, default Europe/Berlin', () => {
            const berlin = run(ANDROID_US, { fileName: FILE_NAME, ownerName: 'Bob Sample' }).activities[0];
            const utc = run(ANDROID_US, { fileName: FILE_NAME, ownerName: 'Bob Sample', timezone: 'UTC' })
                .activities[0];

            expect(berlin.startTime.toUTC().toISO()).toBe('2026-01-02T08:06:00.000Z');
            expect(utc.startTime.toUTC().toISO()).toBe('2026-01-02T09:06:00.000Z');
        });

        it('handles wall times around the daylight saving transitions', () => {
            const { activities } = run(DST_CHAT, { fileName: FILE_NAME, ownerName: 'Bob Sample' });
            const utc = activities.map((a) => a.startTime.toUTC().toFormat("yyyy-MM-dd'T'HH:mm"));

            expect(utc).toEqual([
                '2026-03-28T22:59', // CET (+1)
                '2026-03-29T00:59', // still CET
                '2026-03-29T01:00', // 03:00 CEST (+2): one minute later in UTC
                '2026-10-24T23:30', // CEST
                '2026-10-25T02:30', // CET after the clocks went back
            ]);
        });

        it('shifts a wall time inside the spring-forward gap instead of failing', () => {
            const { activities } = run('3/29/26, 02:30 - Alice Example: gap\n', {
                fileName: FILE_NAME,
                ownerName: 'Bob Sample',
            });

            expect(activities).toHaveLength(1);
            expect(activities[0].startTime.isValid).toBe(true);
        });

        it('rejects an unknown timezone', () => {
            expect(() => run(ANDROID_US, { fileName: FILE_NAME, timezone: 'Mars/Olympus' })).toThrow(/timezone/);
        });

        it('treats groups as target-less', () => {
            const { activities, isGroup, ownerName } = run(GROUP_CHAT, {
                fileName: 'WhatsApp Chat with Weekend Crew.txt',
                ownerName: 'Dan Demo',
            });

            expect(isGroup).toBe(true);
            expect(ownerName).toBe('Dan Demo');
            expect(activities).toHaveLength(4);
            expect(activities.every((a) => a.target === undefined)).toBe(true);
            expect(activities.every((a) => a.conversationId === 'whatsapp:Weekend Crew')).toBe(true);
            expect(activities.map((a) => a.direction)).toEqual(['incoming', 'incoming', 'outgoing', 'incoming']);
            expect(activities[3].actor).toMatchObject({
                name: '+49 151 2345678',
                stableKeys: ['person:phone:+491512345678', 'person:handle:whatsapp-name:+49 151 2345678'],
            });
        });

        it('falls back to the owner actor name for the owner in groups', () => {
            const { ownerName } = run(
                GROUP_CHAT.replace('Dan Demo', 'Bob Sample').replace('Bob Sample: Hi', 'Cy: Hi'),
                {
                    fileName: 'WhatsApp Chat with Weekend Crew.txt',
                    ownerActorName: 'bob sample',
                },
            );

            expect(ownerName).toBe('Bob Sample');
        });

        it('requires ownerName for groups that do not contain the owner actor name', () => {
            expect(() => run(GROUP_CHAT, { fileName: 'WhatsApp Chat with Weekend Crew.txt' })).toThrow(/ownerName/);
        });

        it('takes the sender named in the file name as partner when ownerName is missing', () => {
            const { ownerName, activities } = run(SAME_CHAT_US, { fileName: FILE_NAME });

            expect(ownerName).toBe('Bob Sample');
            expect(activities[0].direction).toBe('incoming');
        });

        it('fails for two senders when neither matches the file name nor the owner', () => {
            expect(() => run(SAME_CHAT_US, { fileName: 'WhatsApp Chat with Somebody Else.txt' })).toThrow(/ownerName/);
        });

        it('uses chatName over the file name', () => {
            const { activities, chatName } = run(SAME_CHAT_US, {
                fileName: FILE_NAME,
                chatName: 'Custom',
                ownerName: 'Bob Sample',
            });

            expect(chatName).toBe('Custom');
            expect(activities[0].conversationId).toBe('whatsapp:Custom');
        });
    });

    describe('stable keys', () => {
        const keysOf = (activities: Activity[]) => activities.map((a) => a.stableKeys![0]);

        it('follows whatsapp:<chat>:<UTC minute>:<sender>:<hash>:<n>', () => {
            const { activities } = run(SAME_CHAT_US, { fileName: FILE_NAME, ownerName: 'Bob Sample' });

            expect(keysOf(activities)[0]).toMatch(
                /^whatsapp:Alice Example:2026-01-13T08:06Z:Alice Example:[\da-f]{12}:1$/,
            );
        });

        it('is identical for the same chat exported in another locale and format', () => {
            const us = run(SAME_CHAT_US, { fileName: FILE_NAME, ownerName: 'Bob Sample' }).activities;
            const iosDe = run(SAME_CHAT_IOS_DE, { fileName: FILE_NAME, ownerName: 'Bob Sample' }).activities;

            expect(keysOf(iosDe)).toEqual(keysOf(us));
            expect(new Set(keysOf(us)).size).toBe(us.length);
        });

        it('keeps identical repeated messages distinct with an ordinal', () => {
            const { activities } = run(REPEATED, { fileName: FILE_NAME, ownerName: 'Bob Sample' });
            const keys = keysOf(activities);

            expect(new Set(keys).size).toBe(3);
            expect(keys[0].endsWith(':1')).toBe(true);
            expect(keys[1].endsWith(':2')).toBe(true);
            expect(keys[2].endsWith(':1')).toBe(true);
        });
    });

    describe('detectFile', () => {
        const sample = (head: string, fileName = 'chat.txt', extension = 'txt') => ({
            relativePath: fileName,
            fileName,
            extension,
            size: head.length,
            head,
        });

        it('recognises chats by header', () => {
            expect(module.detectFile(sample(ANDROID_US))).toMatchObject({ confidence: 0.9 });
            expect(module.detectFile(sample(SAME_CHAT_IOS_DE))).toMatchObject({ confidence: 0.9 });
        });

        it('recognises chats by file name', () => {
            expect(module.detectFile(sample('', FILE_NAME))).toMatchObject({ confidence: 0.85 });
        });

        it('ignores other text files and other extensions', () => {
            expect(module.detectFile(sample('Compact summary\nno headers here'))).toBeUndefined();
            expect(module.detectFile(sample(ANDROID_US, 'chat.csv', 'csv'))).toBeUndefined();
        });
    });

    describe('executeModule', () => {
        it('reads the asset, uses the owner actor name and the original file name', async () => {
            void assetService.getAssetString.mockResolvedValue(SAME_CHAT_US);

            const output = await module.executeModule({
                em: {} as EntityManager,
                inputData: { chatFile: { originalFilename: FILE_NAME } as AssetDto },
                progress: NOOP_MODULE_PROGRESS_REPORTER,
            } as never);

            expect(output.activities).toHaveLength(4);
            expect((output.activities[0] as unknown as Activity).direction).toBe('incoming');
        });
    });
});

describe('chatNameFromFileName', () => {
    it.each([
        ['WhatsApp Chat with Alice Example.txt', 'Alice Example'],
        ['WhatsApp Chat - Alice Example.txt', 'Alice Example'],
        ['WhatsApp-Chat mit Alice Example.txt', 'Alice Example'],
        ['some/dir/WhatsApp Chat with Weekend Crew.txt', 'Weekend Crew'],
    ])('%s -> %s', (fileName, expected) => {
        expect(chatNameFromFileName(fileName)).toBe(expected);
    });

    it('returns undefined for _chat.txt or missing names', () => {
        expect(chatNameFromFileName('_chat.txt')).toBeUndefined();
        expect(chatNameFromFileName(undefined)).toBeUndefined();
    });
});

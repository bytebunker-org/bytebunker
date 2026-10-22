import { describe, expect, it } from 'vitest';
import {
    AMBIGUOUS_SLASH,
    ANDROID_DE,
    ANDROID_US,
    ANDROID_US_12H_4DIGIT_YEAR,
    IOS_DE,
    IOS_US_12H,
    LRM,
    NOT_A_CHAT,
} from './whatsapp-chat.fixture.js';
import { looksLikeWhatsAppChat, parseWhatsAppChat } from './whatsapp-chat.parser.js';

describe('parseWhatsAppChat', () => {
    describe('Android US', () => {
        const chat = parseWhatsAppChat(ANDROID_US);

        it('detects the format and the month-first order from a day above 12', () => {
            expect(chat.format).toEqual({
                style: 'android',
                dateSeparator: '/',
                dateOrder: 'MDY',
                hour12: false,
                dateOrderGuessed: false,
            });
            expect(chat.messages[0].wallTime).toBe('2026-01-02T09:05:00');
            expect(chat.messages.find((m) => m.text === 'Hello there')?.wallTime).toBe('2026-01-02T09:06:00');
        });

        it('classifies sender-less lines as system', () => {
            const system = chat.messages.filter((m) => m.sender === undefined);

            expect(system.map((m) => m.kind)).toEqual(['system', 'system', 'call', 'system', 'system']);
        });

        it('joins continuation lines including blank ones', () => {
            const message = chat.messages.find((m) => m.sender === 'Bob Sample' && m.text.startsWith('Hi Alice'));

            expect(message?.text).toBe("Hi Alice\nsecond line of Bob's message\n\nfourth line after a blank one");
            expect(message?.kind).toBe('text');
        });

        it('marks media placeholders, deleted and edited messages', () => {
            const byKind = (kind: string) => chat.messages.filter((m) => m.kind === kind);

            expect(byKind('media').map((m) => m.text)).toEqual(['', 'look at this']);
            expect(byKind('media')[1].mediaFileName).toBe('IMG-20260113-WA0001.jpg');
            expect(byKind('deleted')).toHaveLength(2);
            expect(byKind('deleted').every((m) => m.text === '')).toBe(true);

            const edited = chat.messages.find((m) => m.edited);
            expect(edited).toMatchObject({ text: 'Fixed the typo', kind: 'text', sender: 'Bob Sample' });
        });

        it('extracts location coordinates, contact cards and polls', () => {
            const location = chat.messages.find((m) => m.kind === 'location');
            expect(location).toMatchObject({ latitude: 48.137_154, longitude: 11.576_124 });

            expect(chat.messages.find((m) => m.kind === 'contact')).toMatchObject({
                mediaFileName: 'Carol Contact.vcf',
                text: '',
            });

            const poll = chat.messages.find((m) => m.kind === 'poll');
            expect(poll?.text).toContain('OPTION: Pizza (2 votes)');
        });

        it('does not take a colon inside a quoted subject for a sender', () => {
            const subject = chat.messages.at(-1);

            expect(subject).toMatchObject({ kind: 'system' });
            expect(subject?.sender).toBeUndefined();
        });
    });

    describe('Android DE', () => {
        const chat = parseWhatsAppChat(ANDROID_DE);

        it('detects dotted day-first dates', () => {
            expect(chat.format).toMatchObject({ style: 'android', dateSeparator: '.', dateOrder: 'DMY' });
            expect(chat.messages[1].wallTime).toBe('2026-01-02T09:06:00');
            expect(chat.messages.at(-1)?.wallTime).toBe('2026-01-13T18:36:00');
        });

        it('recognises German markers', () => {
            expect(chat.messages.map((m) => m.kind)).toEqual([
                'system',
                'text',
                'text',
                'media',
                'deleted',
                'deleted',
                'text',
                'media',
                'location',
                'call',
            ]);
            expect(chat.messages.find((m) => m.edited)?.text).toBe('Tippfehler korrigiert');
            expect(chat.messages.find((m) => m.mediaFileName)?.text).toBe('schau mal');
            expect(chat.messages.find((m) => m.kind === 'location')?.latitude).toBe(48.137_154);
        });
    });

    describe('iOS', () => {
        it('parses bracketed German headers with seconds and direction marks', () => {
            const chat = parseWhatsAppChat(IOS_DE);

            expect(chat.format).toMatchObject({ style: 'ios', dateSeparator: '.', dateOrder: 'DMY' });
            expect(chat.messages.map((m) => m.kind)).toEqual(['text', 'text', 'media', 'media', 'deleted', 'text']);
            expect(chat.messages[0]).toMatchObject({ sender: 'Alice Example', text: 'Hallo' });
            expect(chat.messages[0].wallTime).toBe('2026-01-02T09:05:11');
            expect(chat.messages[3].mediaFileName).toBe('00000012-PHOTO-2026-01-13-18-34-10.jpg');
            expect(chat.messages[5]).toMatchObject({ edited: true, text: 'Tippfehler korrigiert' });
        });

        it('parses 12h US times with a narrow no-break space and a BOM', () => {
            const chat = parseWhatsAppChat(IOS_US_12H);

            expect(chat.format).toMatchObject({ style: 'ios', dateOrder: 'MDY', hour12: true });
            expect(chat.messages.map((m) => m.wallTime)).toEqual([
                '2026-01-02T09:05:11',
                '2026-01-02T09:07:40',
                '2026-01-13T18:30:02',
                '2026-01-13T00:05:00',
                '2026-01-13T12:05:00',
                '2026-01-13T18:34:10',
                '2026-01-13T18:36:00',
            ]);
            expect(chat.messages[2]).toMatchObject({ kind: 'media', text: '' });
            expect(chat.messages[6].kind).toBe('deleted');
        });
    });

    it('parses 4-digit years with AM/PM on Android', () => {
        const chat = parseWhatsAppChat(ANDROID_US_12H_4DIGIT_YEAR);

        expect(chat.messages.map((m) => m.wallTime)).toEqual(['2026-01-02T09:05:00', '2026-01-02T21:07:00']);
    });

    it('guesses the US order for ambiguous slash dates and flags it', () => {
        const chat = parseWhatsAppChat(AMBIGUOUS_SLASH);

        expect(chat.format).toMatchObject({ dateOrder: 'MDY', dateOrderGuessed: true });
        expect(chat.messages[0].wallTime).toBe('2026-03-04T09:05:00');
    });

    it('reads day-first slash dates when a first value exceeds 12', () => {
        const chat = parseWhatsAppChat('13/02/2026, 09:05 - Alice Example: hi\n02/03/2026, 09:05 - Bob Sample: yo\n');

        expect(chat.format).toMatchObject({ dateOrder: 'DMY', dateSeparator: '/' });
        expect(chat.messages[1].wallTime).toBe('2026-03-02T09:05:00');
    });

    it('handles CRLF line endings', () => {
        const chat = parseWhatsAppChat(ANDROID_DE.replaceAll('\n', '\r\n'));

        expect(chat.messages).toHaveLength(10);
        expect(chat.messages[2].text).toBe('Hi Alice\nzweite Zeile');
    });

    it('returns nothing for a file without headers', () => {
        const chat = parseWhatsAppChat(NOT_A_CHAT);

        expect(chat.messages).toEqual([]);
        expect(chat.skippedLines).toBe(2);
    });

    it('counts lines before the first header and treats impossible dates as continuation', () => {
        const chat = parseWhatsAppChat('preamble\n1/2/26, 9:05 - Alice Example: see\n2/30/26, 9:05 - not a header\n');

        expect(chat.skippedLines).toBe(1);
        expect(chat.messages[0].text).toBe('see\n2/30/26, 9:05 - not a header');
    });

    it('classifies a sender-ful short missed call but not a chatty text', () => {
        const chat = parseWhatsAppChat(
            `1/2/26, 9:05 - Alice Example: Missed voice call\n1/2/26, 9:06 - Alice Example: Voice call tomorrow?\n`,
        );

        expect(chat.messages.map((m) => m.kind)).toEqual(['call', 'text']);
    });

    it('recognises typed omitted placeholders', () => {
        const chat = parseWhatsAppChat(
            [
                `${LRM}1/2/26, 9:05 - A: sticker omitted`,
                '1/2/26, 9:06 - A: GIF omitted',
                '1/2/26, 9:07 - A: <video omitted>',
                '1/2/26, 9:08 - A: Kontaktkarte weggelassen',
                '1/2/26, 9:09 - A: Dokument weggelassen',
            ].join('\n'),
        );

        expect(chat.messages.map((m) => m.kind)).toEqual(['media', 'media', 'media', 'contact', 'media']);
    });
});

describe('looksLikeWhatsAppChat', () => {
    it('accepts every header format', () => {
        for (const sample of [ANDROID_US, ANDROID_DE, IOS_DE, IOS_US_12H, ANDROID_US_12H_4DIGIT_YEAR]) {
            expect(looksLikeWhatsAppChat(sample)).toBe(true);
        }
    });

    it('rejects other text', () => {
        expect(looksLikeWhatsAppChat(NOT_A_CHAT)).toBe(false);
        expect(looksLikeWhatsAppChat('')).toBe(false);
        expect(looksLikeWhatsAppChat('2026-01-02 09:05 some log line\n')).toBe(false);
    });
});

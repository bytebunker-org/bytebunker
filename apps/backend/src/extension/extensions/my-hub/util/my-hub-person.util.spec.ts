import { describe, expect, it } from 'vitest';
import { buildMyHubPersonIdentity, myHubPersonToObject, parseImppUri } from './my-hub-person.util.js';
import { createMyHubPerson } from '../my-hub.fixture.js';
import { personStableKeys } from '../../../../activity-graph/util/person-stable-key.util.js';

describe('parseImppUri', () => {
    it.each([
        ['xmpp:anna@jabber.example.org', { platform: 'xmpp', id: 'anna@jabber.example.org' }],
        ['jabber:anna@jabber.example.org', { platform: 'xmpp', id: 'anna@jabber.example.org' }],
        ['skype:anna.b?call', { platform: 'skype', id: 'anna.b' }],
        ['aim:goim?screenname=Anna%20B', { platform: 'aim', id: 'Anna B' }],
        ['x-apple:anna@icloud.example', { platform: 'x-apple', id: 'anna@icloud.example' }],
        ['sip://anna@sip.example', { platform: 'sip', id: 'anna@sip.example' }],
    ])('parses %s', (value, expected) => {
        expect(parseImppUri(value)).toEqual(expected);
    });

    it('ignores values that are not URIs', () => {
        expect(parseImppUri('just a name')).toBeUndefined();
        expect(parseImppUri('xmpp:')).toBeUndefined();
    });
});

describe('buildMyHubPersonIdentity', () => {
    it('collects the my-hub id, emails, phones and handles', () => {
        const keys = personStableKeys(buildMyHubPersonIdentity(createMyHubPerson()));

        expect(keys).toEqual([
            'person:myhub:101',
            'person:email:erika@example.org',
            'person:phone:+491512345678',
            // Not normalised by my-hub: normalised here with the default country code.
            'person:phone:+49651998877',
            // The call-log handle's key is its number.
            'person:phone:+4965199887',
            'person:handle:xmpp:erika@jabber.example.org',
            'person:handle:skype:erika.m',
            'person:handle:whatsapp-name:erika m',
            'person:handle:whatsapp:key:abc123',
            'person:handle:signal-name:erika',
        ]);
    });

    it('links a WhatsApp chat partner by display name even without a number', () => {
        const identity = buildMyHubPersonIdentity(
            createMyHubPerson({
                emails: [],
                phones: [],
                impps: [],
                handles: [{ platform: 'whatsapp', key: 'name:Opa Hans', displayName: 'Opa Hans', number: null }],
            }),
        );

        // Both the display name and the name: key give the same key; personStableKeys dedupes it.
        expect(personStableKeys(identity)).toEqual(['person:myhub:101', 'person:handle:whatsapp-name:opa hans']);
    });

    it('turns phone-like IMPP URIs into phone keys', () => {
        const identity = buildMyHubPersonIdentity(
            createMyHubPerson({
                emails: [],
                phones: [],
                handles: [],
                impps: ['whatsapp:+49 170 1112223', 'tel:0170 1112224'],
            }),
        );

        expect(personStableKeys(identity)).toEqual([
            'person:myhub:101',
            'person:phone:+491701112223',
            'person:phone:+491701112224',
            'person:handle:whatsapp:+49 170 1112223',
        ]);
    });
});

describe('myHubPersonToObject', () => {
    it('builds a Person + MyHubPerson object with props and nulls for empty fields', () => {
        const object = myHubPersonToObject(createMyHubPerson()) as unknown as Record<string, unknown>;

        expect(object).toMatchObject({
            '@type': 'Person',
            '@secondaryTypes': ['MyHubPerson'],
            name: 'Erika Musterfrau',
            givenName: 'Erika',
            familyName: 'Musterfrau',
            nickname: 'Eri',
            birthday: '1990-04-01',
            organization: 'Example GmbH',
            jobTitle: null,
            myHubId: 101,
            myHubUpdatedAt: '2026-10-01T12:00:00.000Z',
        });
        expect((object['stableKeys'] as string[])[0]).toBe('person:myhub:101');
        expect(object).not.toHaveProperty('@id');
    });
});

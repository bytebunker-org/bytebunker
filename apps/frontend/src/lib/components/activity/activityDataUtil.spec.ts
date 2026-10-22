import { describe, expect, it } from 'vitest';
import type { ASActivity } from '@bytebunker/event-schema';
import {
	asRecord,
	canMergeMessages,
	getAttendees,
	getHostname,
	getMessageView,
	getViewKind,
	hasSecondaryType,
	nameOf,
	safeHref,
	summarizeBrowserVisits
} from './activityDataUtil.js';

function activity(props: Record<string, unknown>): ASActivity {
	return { '@type': 'View', ...props } as unknown as ASActivity;
}

describe('activityDataUtil', () => {
	it('parses nested values given as object or JSON string', () => {
		expect(asRecord({ name: 'a' })).toEqual({ name: 'a' });
		expect(asRecord('{"name":"a"}')).toEqual({ name: 'a' });
		expect(asRecord('not json')).toBeUndefined();
		expect(nameOf('["Ann","Bob"]')).toBe('Ann, Bob');
		expect(nameOf({ name: 'Ann' })).toBe('Ann');
	});

	it('reads attendees as objects, JSON strings and plain emails', () => {
		const expected = [{ name: 'Ann', email: 'ann@example.com', status: 'accepted' }];
		const attendee = { name: 'Ann', email: 'ann@example.com', status: 'accepted' };

		expect(getAttendees(activity({ attendees: [attendee] }))).toEqual(expected);
		expect(getAttendees(activity({ attendees: JSON.stringify([attendee]) }))).toEqual(expected);
		expect(getAttendees(activity({ attendees: ['bob@example.com'] }))).toEqual([
			{ email: 'bob@example.com' }
		]);
		expect(getAttendees(activity({}))).toEqual([]);
	});

	it('detects secondary types from arrays and JSON strings', () => {
		expect(hasSecondaryType(activity({ '@secondaryTypes': ['Message'] }), 'Message')).toBe(true);
		expect(hasSecondaryType(activity({ '@secondaryTypes': '["Review"]' }), 'Review')).toBe(true);
		expect(hasSecondaryType(activity({}), 'Review')).toBe(false);
	});

	it('classifies view activities', () => {
		expect(getViewKind(activity({ '@secondaryTypes': ['BrowserVisit'] }))).toBe('browser');
		expect(getViewKind(activity({ object: { '@type': 'YouTubeVideo' } }))).toBe('youtube');
		expect(getViewKind(activity({ product: 'Maps' }))).toBe('google');
	});

	it('builds message views by direction', () => {
		const incoming = getMessageView(
			activity({
				direction: 'incoming',
				actor: { name: 'Ann' },
				target: { name: 'Me' },
				object: { content: 'hi' }
			})
		);
		expect(incoming).toMatchObject({
			direction: 'incoming',
			peerName: 'Ann',
			text: 'hi',
			kind: 'text'
		});

		const outgoing = getMessageView(
			activity({
				direction: 'outgoing',
				actor: { name: 'Me' },
				target: '{"name":"Ann"}',
				edited: true
			})
		);
		expect(outgoing).toMatchObject({ direction: 'outgoing', peerName: 'Ann', edited: true });
	});

	it('merges messages only within a conversation and time window', () => {
		const at = (iso: string, conversationId: string) =>
			activity({ conversationId, startTime: iso });
		const a = at('2025-01-01T10:00:00Z', 'c1');

		expect(canMergeMessages(a, at('2025-01-01T10:10:00Z', 'c1'))).toBe(true);
		expect(canMergeMessages(a, at('2025-01-01T10:10:00Z', 'c2'))).toBe(false);
		expect(canMergeMessages(a, at('2025-01-01T12:00:00Z', 'c1'))).toBe(false);
	});

	it('summarizes browser visits by domain and title', () => {
		const visit = (pageUrl: string, name: string) => activity({ object: { pageUrl, name } });
		const summary = summarizeBrowserVisits([
			visit('https://www.example.com/a', 'Page A'),
			visit('https://example.com/b', 'Page A'),
			visit('https://other.org/', 'Other'),
			visit('not a url', 'Broken')
		]);

		expect(summary.total).toBe(4);
		expect(summary.domains[0]).toEqual({ host: 'example.com', count: 2 });
		expect(summary.domains.map((d) => d.host)).toContain('unknown');
		expect(summary.topTitles[0]).toBe('Page A');
	});

	it('only allows http(s) links', () => {
		expect(safeHref('https://example.com')).toBe('https://example.com');
		expect(safeHref('javascript:alert(1)')).toBeUndefined();
		expect(getHostname('https://www.example.com/x')).toBe('example.com');
	});
});

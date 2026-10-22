import { describe, expect, it } from 'vitest';
import {
    normalizePageUrl,
    pageStableKey,
    profileNameFromPath,
    urlStableKey,
    visitStableKey,
} from './browser-url.util.js';

describe('normalizePageUrl', () => {
    it('normalises scheme, host, default port and an empty fragment', () => {
        expect(normalizePageUrl('HTTPS://Example.COM:443/a/b?q=1#')).toBe('https://example.com/a/b?q=1');
        expect(normalizePageUrl('https://example.com')).toBe('https://example.com/');
    });

    it('keeps query and fragment', () => {
        expect(normalizePageUrl('https://mail.example.com/#inbox/123')).toBe('https://mail.example.com/#inbox/123');
    });

    it('keeps file URLs and drops browser-internal ones', () => {
        expect(normalizePageUrl('file:///home/user/report.pdf')).toBe('file:///home/user/report.pdf');

        for (const url of [
            'about:newtab',
            'chrome://settings/',
            'chrome-extension://abc/page.html',
            'moz-extension://abc/page.html',
            'place:sort=8',
            'javascript:void(0)',
            'not a url',
            '',
        ]) {
            expect(normalizePageUrl(url)).toBeUndefined();
        }
    });
});

describe('stable keys', () => {
    it('truncates visit time to milliseconds', () => {
        expect(visitStableKey('https://example.com/', 1_740_823_200_123_456)).toBe(
            'browser:visit:https://example.com/:1740823200123',
        );
    });

    it('keeps keys of long URLs under 512 characters and distinct', () => {
        const base = `https://example.com/${'x'.repeat(600)}`;
        const a = pageStableKey(`${base}a`);
        const b = pageStableKey(`${base}b`);

        expect(a.length).toBeLessThanOrEqual(512);
        expect(a).not.toBe(b);
        expect(urlStableKey('browser:visit:', `${base}a`, ':1740823200123').endsWith(':1740823200123')).toBe(true);
    });
});

describe('profileNameFromPath', () => {
    it('uses the parent folder without the Firefox random prefix', () => {
        expect(profileNameFromPath('firefox/h0f01llj.dev-edition-default/places.sqlite')).toBe('dev-edition-default');
        expect(profileNameFromPath('chrome/Profile 1/History')).toBe('Profile 1');
        expect(profileNameFromPath('places.sqlite')).toBeUndefined();
    });
});

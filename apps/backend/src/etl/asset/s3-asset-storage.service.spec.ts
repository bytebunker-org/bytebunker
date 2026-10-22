import { describe, expect, it } from 'vitest';
import { toS3Metadata } from './s3-asset-storage.service.js';

describe('toS3Metadata', () => {
    it('percent-encodes non-ASCII values and keeps everything else', () => {
        expect(
            toS3Metadata({
                'Content-Type': 'text/html',
                'Original-File-Path': 'google/Meine Aktivitäten/MeineAktivitäten.html',
                size: 12,
            }),
        ).toEqual({
            'Content-Type': 'text/html',
            'Original-File-Path': 'google%2FMeine%20Aktivit%C3%A4ten%2FMeineAktivit%C3%A4ten.html',
            size: 12,
        });
    });

    it('passes undefined through', () => {
        expect(toS3Metadata(undefined)).toBeUndefined();
    });
});

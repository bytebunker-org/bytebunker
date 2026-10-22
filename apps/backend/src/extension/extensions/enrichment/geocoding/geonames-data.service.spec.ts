import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../../../util/config/app.config.js';
import { GeoNamesDataService } from './geonames-data.service.js';

/** The developer's cached dump (gitignored); without it the spec is skipped, it never downloads. */
const cachedDir = path.resolve(import.meta.dirname, '../../../../../temp/geonames');
const files = ['cities1000.zip', 'countryInfo.txt', 'admin1CodesASCII.txt'];

describe.skipIf(!files.every((file) => existsSync(path.join(cachedDir, file))))('GeoNamesDataService', () => {
    let dataDir: string | undefined;

    afterAll(async () => {
        if (dataDir) {
            await rm(dataDir, { recursive: true, force: true });
        }
    });

    it('extracts the cached archive, indexes it once and shares the result', async () => {
        dataDir = await mkdtemp(path.join(os.tmpdir(), 'geonames-spec-'));

        for (const file of files) {
            await copyFile(path.join(cachedDir, file), path.join(dataDir, file));
        }

        const service = new GeoNamesDataService({ geocoding: { dataDir } } as AppConfig);
        const statuses: string[] = [];
        const first = await service.load((status) => statuses.push(status));

        expect(first.info.downloaded).toEqual([]);
        expect(first.info.cityCount).toBeGreaterThan(100_000);
        expect(existsSync(path.join(dataDir, 'cities1000.txt'))).toBe(true);
        expect(statuses).toContain('Extracting cities1000.zip');
        expect(first.lookups.countries.get('DE')).toBe('Germany');
        expect(first.lookups.index.nearest({ latitude: 48.137, longitude: 11.575 })?.city.name).toBe('Munich');

        expect(await service.load()).toBe(first);
    });
});

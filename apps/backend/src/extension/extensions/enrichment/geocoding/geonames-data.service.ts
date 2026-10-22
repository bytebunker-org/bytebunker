import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../../util/config/app.config.js';
import { extractZip } from '../../../../etl/import/zip.util.js';
import {
    CityIndex,
    type GeoNamesLookups,
    parseAdmin1Codes,
    parseCountryInfo,
    parseGeoNamesCities,
} from '../util/geonames.util.js';
import { DEFAULT_GEONAMES_BASE_URL, DEFAULT_GEONAMES_DATA_DIR } from './geocoding.constant.js';

const CITIES_ARCHIVE = 'cities1000.zip';
const CITIES_FILE = 'cities1000.txt';
const COUNTRY_FILE = 'countryInfo.txt';
const ADMIN1_FILE = 'admin1CodesASCII.txt';

export interface GeoNamesLoadInfo {
    dataDir: string;
    downloaded: string[];
    cityCount: number;
    loadMs: number;
}

/**
 * Downloads the GeoNames dump (cities1000, countryInfo, admin1 codes) into the data dir on first use and keeps the
 * parsed index in memory for the lifetime of the process (≈ 150k places, a few dozen MB).
 */
@Injectable()
export class GeoNamesDataService {
    private readonly logger = new Logger(GeoNamesDataService.name);
    private loading?: Promise<{ lookups: GeoNamesLookups; info: GeoNamesLoadInfo }>;

    constructor(private readonly appConfig: AppConfig) {}

    public get dataDir(): string {
        return path.resolve(this.appConfig.geocoding?.dataDir ?? DEFAULT_GEONAMES_DATA_DIR);
    }

    private get baseUrl(): string {
        return (this.appConfig.geocoding?.geonamesBaseUrl ?? DEFAULT_GEONAMES_BASE_URL).replace(/\/+$/, '');
    }

    /** The parsed lookups; the first call downloads and parses, later calls share the result. */
    public load(onStatus?: (message: string) => void): Promise<{ lookups: GeoNamesLookups; info: GeoNamesLoadInfo }> {
        this.loading ??= this.loadFresh(onStatus).catch((error: unknown) => {
            // A failed download must not stick: the next run tries again.
            this.loading = undefined;
            throw error;
        });

        return this.loading;
    }

    private async loadFresh(
        onStatus?: (message: string) => void,
    ): Promise<{ lookups: GeoNamesLookups; info: GeoNamesLoadInfo }> {
        const started = Date.now();
        const dataDir = this.dataDir;
        await fs.mkdir(dataDir, { recursive: true });
        const downloaded: string[] = [];

        for (const file of [COUNTRY_FILE, ADMIN1_FILE]) {
            if (!existsSync(path.join(dataDir, file))) {
                onStatus?.(`Downloading GeoNames ${file}`);
                await this.download(file, dataDir);
                downloaded.push(file);
            }
        }

        if (!existsSync(path.join(dataDir, CITIES_FILE))) {
            if (!existsSync(path.join(dataDir, CITIES_ARCHIVE))) {
                onStatus?.(`Downloading GeoNames ${CITIES_ARCHIVE}`);
                await this.download(CITIES_ARCHIVE, dataDir);
                downloaded.push(CITIES_ARCHIVE);
            }

            onStatus?.(`Extracting ${CITIES_ARCHIVE}`);
            await extractZip(path.join(dataDir, CITIES_ARCHIVE), dataDir, (entry) => entry === CITIES_FILE);

            if (!existsSync(path.join(dataDir, CITIES_FILE))) {
                throw new Error(`${CITIES_ARCHIVE} in ${dataDir} does not contain ${CITIES_FILE}`);
            }
        }

        onStatus?.('Indexing GeoNames places');
        const [citiesText, countryText, admin1Text] = await Promise.all(
            [CITIES_FILE, COUNTRY_FILE, ADMIN1_FILE].map((file) => fs.readFile(path.join(dataDir, file), 'utf8')),
        );
        const cities = parseGeoNamesCities(citiesText!);
        const lookups: GeoNamesLookups = {
            index: new CityIndex(cities),
            countries: parseCountryInfo(countryText!),
            admin1: parseAdmin1Codes(admin1Text!),
        };
        const info = { dataDir, downloaded, cityCount: cities.length, loadMs: Date.now() - started };

        this.logger.log(
            `Loaded ${cities.length} GeoNames places from ${dataDir} in ${info.loadMs} ms` +
                (downloaded.length ? ` (downloaded ${downloaded.join(', ')})` : ''),
        );

        return { lookups, info };
    }

    /** Downloads into a temporary file first, so an interrupted download is not mistaken for a complete one. */
    private async download(file: string, dataDir: string): Promise<void> {
        const url = `${this.baseUrl}/${file}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });

        if (!response.ok) {
            throw new Error(`Downloading ${url} failed: HTTP ${response.status} ${response.statusText}`);
        }

        const target = path.join(dataDir, file);
        const partial = `${target}.part`;
        // The largest file (cities1000.zip) has about 11 MB; buffering it is fine.
        await fs.writeFile(partial, Buffer.from(await response.arrayBuffer()));
        await fs.rename(partial, target);
    }
}

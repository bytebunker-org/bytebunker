import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/**
 * Optional `[geocoding]` section. Every key has a safe default (see the enrichment extension's
 * `geocoding.constant.ts`), so the section may be left out entirely.
 */
export class GeocodingConfig {
    /** Where the GeoNames dump files are downloaded and cached. Default `./temp/geonames` (relative to the cwd). */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public readonly dataDir?: string;

    /** Base URL of the GeoNames dump. Default `https://download.geonames.org/export/dump`. */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public readonly geonamesBaseUrl?: string;

    /** Nominatim instance for the online refinement. Default `https://nominatim.openstreetmap.org`. */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public readonly nominatimBaseUrl?: string;

    /**
     * Minimum milliseconds between two Nominatim requests. Default 1000; values below 1000 are only honoured for a
     * self-hosted instance (the public one allows at most one request per second).
     */
    @IsOptional()
    @IsInt()
    @Min(0)
    public readonly nominatimMinIntervalMs?: number;

    /**
     * Mapbox access token for the Mapbox place refinement (temporary Geocoding API). Without it the Mapbox refinement
     * does nothing.
     */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public readonly mapboxAccessToken?: string;

    /** Default `https://api.mapbox.com`. */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public readonly mapboxBaseUrl?: string;

    /** Minimum milliseconds between two Mapbox requests. Default 150 (Mapbox allows 600 per minute). */
    @IsOptional()
    @IsInt()
    @Min(0)
    public readonly mapboxMinIntervalMs?: number;
}

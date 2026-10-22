import { PrimaryKeyProp } from '@mikro-orm/core';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsEnum,
    IsInt,
    IsLatitude,
    IsLongitude,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { TimestampDto } from '../../../../../database/util/timestamp.dto.js';
import { CustomPlaceRoleEnum } from './custom-place-role.enum.js';

export const CUSTOM_PLACE_DEFAULT_RADIUS_METERS = 75;
export const CUSTOM_PLACE_MIN_RADIUS_METERS = 10;
export const CUSTOM_PLACE_MAX_RADIUS_METERS = 2000;
const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * A place the user defined (Settings → Eigene Orte). Canonical places within its radius are named after it before
 * any geocoding provider; home and work places drive the home/work periods.
 */
export class CustomPlaceDto extends TimestampDto {
    [PrimaryKeyProp]?: 'id';

    @IsInt()
    public id!: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    public name!: string;

    @IsLatitude()
    public latitude!: number;

    @IsLongitude()
    public longitude!: number;

    /** Canonical places whose centre lies within this many meters belong to the place. */
    @IsInt()
    @Min(CUSTOM_PLACE_MIN_RADIUS_METERS)
    @Max(CUSTOM_PLACE_MAX_RADIUS_METERS)
    public radiusMeters!: number;

    @ApiProperty({ enum: CustomPlaceRoleEnum, enumName: 'CustomPlaceRoleEnum' })
    @IsEnum(CustomPlaceRoleEnum)
    public role!: CustomPlaceRoleEnum;

    /** First day (`YYYY-MM-DD`, inclusive) the place had its role, e.g. moving-in day. */
    @IsOptional()
    @Matches(DAY_PATTERN)
    public validFrom?: string | null;

    /** Last day (`YYYY-MM-DD`, inclusive) the place had its role, e.g. moving-out day. */
    @IsOptional()
    @Matches(DAY_PATTERN)
    public validTo?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    public notes?: string | null;
}

// Declared with their own decorators instead of mapped types: see CreatePipelineBlueprintDto.
export class CreateCustomPlaceDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    public name!: string;

    @IsLatitude()
    public latitude!: number;

    @IsLongitude()
    public longitude!: number;

    /** Default 75. */
    @IsOptional()
    @IsInt()
    @Min(CUSTOM_PLACE_MIN_RADIUS_METERS)
    @Max(CUSTOM_PLACE_MAX_RADIUS_METERS)
    public radiusMeters?: number;

    /** Default `other`. */
    @ApiProperty({ enum: CustomPlaceRoleEnum, enumName: 'CustomPlaceRoleEnum', required: false })
    @IsOptional()
    @IsEnum(CustomPlaceRoleEnum)
    public role?: CustomPlaceRoleEnum;

    @IsOptional()
    @Matches(DAY_PATTERN)
    public validFrom?: string | null;

    @IsOptional()
    @Matches(DAY_PATTERN)
    public validTo?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    public notes?: string | null;
}

/** Only the given properties change; `null` clears validFrom, validTo and notes. */
export class UpdateCustomPlaceDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    public name?: string;

    @IsOptional()
    @IsLatitude()
    public latitude?: number;

    @IsOptional()
    @IsLongitude()
    public longitude?: number;

    @IsOptional()
    @IsInt()
    @Min(CUSTOM_PLACE_MIN_RADIUS_METERS)
    @Max(CUSTOM_PLACE_MAX_RADIUS_METERS)
    public radiusMeters?: number;

    @ApiProperty({ enum: CustomPlaceRoleEnum, enumName: 'CustomPlaceRoleEnum', required: false })
    @IsOptional()
    @IsEnum(CustomPlaceRoleEnum)
    public role?: CustomPlaceRoleEnum;

    @IsOptional()
    @Matches(DAY_PATTERN)
    public validFrom?: string | null;

    @IsOptional()
    @Matches(DAY_PATTERN)
    public validTo?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    public notes?: string | null;
}

/** A frequently visited canonical place no custom place covers yet. */
export class CustomPlaceSuggestionDto {
    /** Canonical place id. */
    public id!: string;

    public name?: string;

    /** Where the current name comes from: custom, osm, mapbox, source or address. */
    public nameSource?: string;

    public city?: string;

    public country?: string;

    public latitude!: number;

    public longitude!: number;

    public visitCount!: number;

    /** Role inferred from the HOME_DURING / WORK_DURING periods pointing at the place. */
    @ApiProperty({ enum: CustomPlaceRoleEnum, enumName: 'CustomPlaceRoleEnum', required: false })
    public inferredRole?: CustomPlaceRoleEnum;

    /** Earliest start and latest end of those periods (ISO), if any. */
    public roleFrom?: string;

    public roleTo?: string;
}

export class CustomPlaceApplyResultDto {
    public outcome!: 'started' | 'skipped' | 'failed';

    /** The started execution of the place enrichment blueprint, or the still running one that caused the skip. */
    public executionId?: number;

    public blueprintId!: number;

    public reason?: string;
}

import { IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { SettingDto } from './setting.dto.js';
import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import { Type } from 'class-transformer';
import type { DtoRelation } from '../../../util/type/dto-relation.type.js';

export class SettingCategoryDto extends TimestampDto {
    @IsString()
    @MaxLength(64)
    public key!: string;

    @IsString()
    @IsOptional()
    @MaxLength(64)
    public parentCategoryKey?: string;

    @ValidateNested()
    @IsOptional()
    @Type(() => SettingCategoryDto)
    public parentCategory?: DtoRelation<SettingCategoryDto>;

    @IsString()
    @IsOptional()
    @MaxLength(48)
    public icon?: string;

    @IsBoolean()
    public hidden!: boolean;

    @ValidateNested({ each: true })
    @IsOptional()
    @Type(() => SettingCategoryDto)
    public subCategories?: SettingCategoryDto[];

    @ValidateNested({ each: true })
    @IsOptional()
    @Type(() => SettingDto)
    public settings?: SettingDto[];
}

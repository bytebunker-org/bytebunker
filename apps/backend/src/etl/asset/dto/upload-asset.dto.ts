import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssetTypeEnum } from '../type/asset-type.enum.js';

export class UploadAssetDto {
    @ApiPropertyOptional({ enum: AssetTypeEnum, default: AssetTypeEnum.PRIMARY })
    @IsOptional()
    @IsEnum(AssetTypeEnum)
    public type?: AssetTypeEnum;

    @ApiPropertyOptional({ description: 'JSON string of metadata to attach to the asset' })
    @IsOptional()
    @IsString()
    public metadata?: string;
}

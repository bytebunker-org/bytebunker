import { PickType } from '@nestjs/swagger';
import { AssetDto } from './asset.dto.js';
import { IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAssetDto extends PickType(AssetDto, ['type', 'metadata'] as const) {
    @IsOptional()
    @IsUUID()
    public parentAssetId?: string;

    @IsOptional()
    @IsString()
    public originalFilePath?: string;

    @IsOptional()
    @IsInt()
    public size?: number;
}

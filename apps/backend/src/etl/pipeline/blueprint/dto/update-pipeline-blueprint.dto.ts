import { IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BlueprintDataDto } from './blueprint-data.dto.js';

// See CreatePipelineBlueprintDto for why this is not a mapped type.
export class UpdatePipelineBlueprintDto {
    @IsString()
    @MaxLength(255)
    public title!: string;

    @IsOptional()
    @IsString()
    public description?: string;

    @Type(() => BlueprintDataDto)
    @IsObject()
    @ValidateNested()
    public data!: BlueprintDataDto;
}

import { XyPositionDto } from './xy-position.dto.js';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, Matches, Min, ValidateNested } from 'class-validator';
import type { PipelineModuleIdentifier } from '../../pipeline-module/type/pipeline-module-identifier.type.js';
import { PIPELINE_MODULE_IDENTIFIER_REGEX } from '../../pipeline-module/pipeline-module.constant.js';
import { ApiProperty } from '@nestjs/swagger';

export class BlueprintNodeDto {
    @IsInt()
    @Min(0)
    public id!: number;

    @ApiProperty({
        type: 'string',
        example: 'my-extension:my-module@1',
    })
    @Matches(PIPELINE_MODULE_IDENTIFIER_REGEX)
    public moduleId!: PipelineModuleIdentifier;

    @IsOptional()
    @IsObject()
    public constantInputData?: Record<string, unknown>;

    @Type(() => XyPositionDto)
    @IsObject()
    @ValidateNested()
    public position!: XyPositionDto;

    @IsOptional()
    @IsInt()
    @Min(0)
    public parentId?: number;

    constructor(data: BlueprintNodeDto) {
        Object.assign(this, data);
    }
}

import { IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PipelineModuleTypeEnum } from '../type/pipeline-module-type.enum.js';
import { JsonSchemaDto } from '../../../../shared/json-schema/dto/json-schema.dto.js';
import { TimestampDto } from '../../../../database/util/timestamp.dto.js';
import { PIPELINE_MODULE_IDENTIFIER_REGEX } from '../pipeline-module.constant.js';
import type { DtoRef } from '../../../../util/type/dto-ref.type.js';
import { ExtensionDto } from '../../../../extension/dto/extension.dto.js';
import type { PipelineModuleIdentifier } from '../type/pipeline-module-identifier.type.js';
import { PrimaryKeyProp } from '@mikro-orm/core';
import type { DtoCollection } from '../../../../util/type/dto-collection.type.js';
import { PipelineBlueprintDto } from '../../blueprint/dto/pipeline-blueprint.dto.js';

export class PipelineModuleDto extends TimestampDto {
    [PrimaryKeyProp]?: 'id';

    /** Extension relation for the pipeline module */
    @Type(() => ExtensionDto)
    @IsOptional()
    @ValidateNested()
    public extension!: DtoRef<ExtensionDto>;

    /** The name of the module */
    @IsString()
    public name!: string;

    /** The version of the module */
    @IsInt()
    @Min(0)
    public version!: number;

    /** Unique identifier for the pipeline module */
    @IsString()
    @Matches(PIPELINE_MODULE_IDENTIFIER_REGEX)
    public id!: PipelineModuleIdentifier;

    /** The type of the pipeline module */
    @IsEnum(PipelineModuleTypeEnum)
    public type!: PipelineModuleTypeEnum;

    /** Input type schema relation */
    @Type(() => JsonSchemaDto)
    @IsOptional()
    @ValidateNested()
    public inputTypeSchema?: DtoRef<JsonSchemaDto>;

    /** Output type schema relation */
    @Type(() => JsonSchemaDto)
    @IsOptional()
    @ValidateNested()
    public outputTypeSchema?: DtoRef<JsonSchemaDto>;

    @Type(() => PipelineBlueprintDto)
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public containingBlueprints!: DtoCollection<PipelineBlueprintDto>;
}

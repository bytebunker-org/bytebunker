import { IsInt, IsOptional, IsString, IsEnum, IsUUID, ValidateNested, Min, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { PipelineModuleTypeEnum } from '../type/pipeline-module-type.enum.js';
import { JsonSchemaDto } from '../../../../shared/json-schema/dto/json-schema.dto.js';
import { TimestampDto } from '../../../../database/util/timestamp.dto.js';
import { PIPELINE_MODULE_IDENTIFIER_REGEX } from '../pipeline-module.constant.js';
import type { DtoRef } from '../../../../util/type/dto-ref.type.js';
import { ExtensionDto } from '../../../../extension/dto/extension.dto.js';

export class PipelineModuleDto extends TimestampDto {
    /** Unique identifier for the pipeline module */
    @IsString()
    @Matches(PIPELINE_MODULE_IDENTIFIER_REGEX)
    public id!: string;

    /** Unique identifier for the associated extension */
    @IsUUID()
    public extensionId!: string;

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

    /** The type of the pipeline module */
    @IsEnum(PipelineModuleTypeEnum)
    public type!: PipelineModuleTypeEnum;

    /** URI for the input type schema */
    @IsString()
    @IsOptional()
    public inputTypeSchemaUri?: string;

    /** URI for the output type schema */
    @IsString()
    @IsOptional()
    public outputTypeSchemaUri?: string;

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
}

import { IsArray, IsBoolean, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import type { AnySchemaObject } from 'ajv';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ErrorObjectDto {
    @IsString()
    public keyword!: string;

    @IsString()
    public instancePath!: string;

    @IsString()
    public schemaPath!: string;

    @IsObject()
    public params!: Record<string, any>;

    /**
     * Added to validation errors of "propertyNames" keyword schema
     */
    @IsString()
    @IsOptional()
    public propertyName?: string;

    /**
     * Excluded if option `messages` set to false.
     */
    @IsString()
    @IsOptional()
    public message?: string;

    /**
     * These are added with the `verbose` option.
     */
    @IsObject()
    @IsOptional()
    public schema?: unknown;

    @IsObject()
    @IsOptional()
    parentSchema?: AnySchemaObject;

    @ApiProperty()
    public data?: unknown;
}

export class ValidationResultDto {
    @IsBoolean()
    public success!: boolean;

    @IsString()
    public message!: string;

    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    @Type(() => ErrorObjectDto)
    @ApiProperty({
        type: () => [ErrorObjectDto],
        title: 'Error object list',
        externalDocs: {
            description: 'Ajv Api Reference - Error Objects',
            url: 'https://ajv.js.org/api.html#error-objects',
        },
    })
    public errors!: ErrorObjectDto[];
}

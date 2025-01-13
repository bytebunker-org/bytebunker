import { XyPositionDto } from './xy-position.dto.js';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsObject, IsString, Min, ValidateNested } from 'class-validator';

export class BlueprintNodeDto {
    @IsInt()
    @Min(0)
    public id!: number;

    @Type(() => XyPositionDto)
    @IsObject()
    @ValidateNested()
    public position!: XyPositionDto;

    @IsString()
    @IsNotEmpty()
    public type!: string;

    @IsInt()
    @Min(0)
    public parentId!: string;
}

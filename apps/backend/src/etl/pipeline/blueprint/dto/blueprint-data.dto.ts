import { BlueprintNodeDto } from './blueprint-node.dto.js';
import { BlueprintEdgeDto } from './blueprint-edge.dto.js';
import { IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BlueprintDataDto {
    @Type(() => BlueprintNodeDto)
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public nodes!: BlueprintNodeDto[];

    @Type(() => BlueprintEdgeDto)
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public edges!: BlueprintEdgeDto[];
}

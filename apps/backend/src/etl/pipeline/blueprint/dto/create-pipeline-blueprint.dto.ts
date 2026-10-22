import { IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BlueprintDataDto } from './blueprint-data.dto.js';

// Declared with its own decorators instead of Pick/IntersectionType from @nestjs/swagger: the mapped types did not
// carry the class-validator metadata over, so the global whitelist ValidationPipe rejected every property.
export class CreatePipelineBlueprintDto {
    /** The title of the pipeline blueprint */
    @IsString()
    @MaxLength(255)
    public title!: string;

    /** An optional description of the pipeline blueprint */
    @IsOptional()
    @IsString()
    public description?: string;

    /** Nodes and edges; defaults to an empty blueprint */
    @IsOptional()
    @Type(() => BlueprintDataDto)
    @IsObject()
    @ValidateNested()
    public data?: BlueprintDataDto;
}

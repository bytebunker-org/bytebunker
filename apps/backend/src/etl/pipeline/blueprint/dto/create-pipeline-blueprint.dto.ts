import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { PipelineBlueprintDto } from './pipeline-blueprint.dto.js';

export class CreatePipelineBlueprintDto extends IntersectionType(
    PickType(PipelineBlueprintDto, ['title', 'description'] as const),
    PartialType(PickType(PipelineBlueprintDto, ['data'] as const)),
) {}

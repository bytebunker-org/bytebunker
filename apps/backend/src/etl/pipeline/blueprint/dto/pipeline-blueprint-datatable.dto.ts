import { PickType } from '@nestjs/swagger';
import { PipelineBlueprintDto } from './pipeline-blueprint.dto.js';

export class PipelineBlueprintDatatableDto extends PickType(PipelineBlueprintDto, [
    'id',
    'title',
    'description',
    'key',
    'createdAt',
    'updatedAt',
] as const) {}

import { PickType } from '@nestjs/swagger';
import { PipelineBlueprintDto } from './pipeline-blueprint.dto.js';

export class UpdatePipelineBlueprintDto extends PickType(PipelineBlueprintDto, ['title', 'description', 'data']) {}

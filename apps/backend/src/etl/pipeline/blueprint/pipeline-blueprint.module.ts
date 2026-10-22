import { PipelineBlueprintValidationService } from './pipeline-blueprint-validation.service.js';
import { Module } from '@nestjs/common';
import { PipelineBlueprintController } from './pipeline-blueprint.controller.js';
import { PipelineBlueprintService } from './pipeline-blueprint.service.js';

@Module({
    controllers: [PipelineBlueprintController],
    providers: [PipelineBlueprintService, PipelineBlueprintValidationService],
})
export class PipelineBlueprintModule {}

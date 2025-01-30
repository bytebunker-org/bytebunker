import { Module } from '@nestjs/common';
import { PipelineBlueprintController } from './pipeline-blueprint.controller.js';
import { PipelineBlueprintService } from './pipeline-blueprint.service.js';

@Module({
    controllers: [PipelineBlueprintController],
    providers: [PipelineBlueprintService],
})
export class PipelineBlueprintModule {}

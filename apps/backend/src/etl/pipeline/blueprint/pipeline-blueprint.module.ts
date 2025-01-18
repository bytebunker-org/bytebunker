import { Module } from '@nestjs/common';
import { PipelineBlueprintController } from './pipeline-blueprint.controller.js';

@Module({
    controllers: [PipelineBlueprintController],
})
export class PipelineBlueprintModule {}

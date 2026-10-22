import { PipelineBlueprintValidationService } from './pipeline-blueprint-validation.service.js';
import { Module } from '@nestjs/common';
import { PipelineBlueprintController } from './pipeline-blueprint.controller.js';
import { PipelineBlueprintService } from './pipeline-blueprint.service.js';
import { PipelineModuleModule } from '../pipeline-module/pipeline-module.module.js';
import { ShippedBlueprintInstallerService } from './shipped/shipped-blueprint-installer.service.js';

@Module({
    imports: [PipelineModuleModule],
    controllers: [PipelineBlueprintController],
    providers: [PipelineBlueprintService, PipelineBlueprintValidationService, ShippedBlueprintInstallerService],
})
export class PipelineBlueprintModule {}

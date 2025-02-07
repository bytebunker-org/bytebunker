import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { PipelineModuleService } from './pipeline-module.service.js';
import { DiscoveryModule } from '@golevelup/nestjs-discovery';
import { JsonSchemaModule } from '../../../shared/json-schema/json-schema.module.js';
import { CorePipelineModuleModule } from './core-module/core-pipeline-module.module.js';

@Module({
    imports: [DiscoveryModule, JsonSchemaModule, CorePipelineModuleModule],
    providers: [PipelineModuleService],
    exports: [PipelineModuleService],
})
export class PipelineModuleModule implements OnApplicationBootstrap {
    constructor(
        private readonly pipelineModuleService: PipelineModuleService,
        private readonly em: EntityManager,
    ) {}

    public onApplicationBootstrap(): Promise<void> {
        return this.em.transactional((em) => this.pipelineModuleService.discoverPipelineModules(em));
    }
}

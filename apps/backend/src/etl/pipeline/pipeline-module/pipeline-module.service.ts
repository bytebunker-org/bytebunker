import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { NIL } from 'uuid';
import type { EntityManager } from '@mikro-orm/postgresql';
import { DiscoveryService } from '@golevelup/nestjs-discovery';
import { PIPELINE_MODULE_METADATA, type PipelineModuleOptions } from './decorator/pipeline-module.decorator.js';
import { PipelineModuleEntity } from './entity/pipeline-module.entity.js';

@Injectable()
export class PipelineModuleService implements OnApplicationBootstrap {
    public static readonly SCHEMA_BASE_URL = 'https://schema.bytebunker.dev/pipeline-module';
    public static readonly CORE_EXTENSION_ID = NIL;
    public static readonly CORE_EXTENSION_NAME = 'core';

    constructor(private readonly discoveryService: DiscoveryService) {}

    public async discoverPipelineModules(em: EntityManager): Promise<void> {
        const knownPipelineModules = await em.findAll(PipelineModuleEntity);

        const discoveredPipelineModules =
            await this.discoveryService.providersWithMetaAtKey<PipelineModuleOptions<unknown, unknown>>(
                PIPELINE_MODULE_METADATA,
            );

        for (const { discoveredClass, meta } of discoveredPipelineModules) {
        }
    }
}

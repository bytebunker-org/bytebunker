import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ExtensionEntity } from './entity/extension.entity.js';
import { ExtensionDeveloperEntity } from './entity/extension-developer.entity.js';
import { CORE_EXTENSION_DEVELOPER_ID, CORE_EXTENSION_DEVELOPER_NAME } from './extension.constant.js';
import { ExtensionService } from './extension.service.js';
import { ExtensionController } from './extension.controller.js';
import { ExtensionDeveloperController } from './extension-developer.controller.js';
import { CommonPipelineTriggersModule } from './extensions/common-pipeline-triggers/common-pipeline-triggers.module.js';
import { localExtensions } from './extensions/local-extension.constant.js';
import { GoogleExtensionModule } from './extensions/google/google-extension.module.js';

const manuallyLoadedExtensions = [CommonPipelineTriggersModule, GoogleExtensionModule];

@Module({
    imports: manuallyLoadedExtensions,
    controllers: [ExtensionController, ExtensionDeveloperController],
    providers: [ExtensionService],
    exports: [ExtensionService],
})
export class ExtensionModule implements OnModuleInit {
    private readonly logger = new Logger(ExtensionModule.name);

    constructor(private readonly em: EntityManager) {}

    public onModuleInit(): Promise<void> {
        return this.em.transactional(async (em) => {
            const coreExtensionDeveloper = await em.upsert(ExtensionDeveloperEntity, {
                id: CORE_EXTENSION_DEVELOPER_ID,
                name: CORE_EXTENSION_DEVELOPER_NAME,
            });

            // TODO: Only upsert core extension here, all others are discovered and added dynamically
            await em.upsertMany(
                ExtensionEntity,
                localExtensions.map(({ id, name }) => ({
                    id,
                    name,
                    developer: coreExtensionDeveloper,
                })),
            );

            this.logger.log('Created local extensions and core extension developer entity');
        });
    }
}
